// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * GPG signer – key management & commit signing.
 *
 * GPG signature verification on GitHub requires:
 *   - The committer email in the commit MUST match the GPG key's UID email
 *   - The GPG key MUST be registered in the committer's GitHub account
 *   - The signed payload must EXACTLY match what GitHub reconstructs
 *   - Author and committer can differ (author = key owner, committer = bot)
 */

import * as openpgp from "../lib/openpgp.min.mjs";
import {STORAGE_KEYS} from "../shared/constants.js";
import {storageGet, storageRemove, storageSet} from "../shared/storage.js";
import {logError, logInfo} from "../shared/logger.js";

let cachedPrivateKey = null;

// ── UID parsing ──

function extractEmailFromUID (userIDs) {
    if (!userIDs || !userIDs.length) return null;
    for (const uid of userIDs) {
        const m = uid.match (/<([^>]+)>/);
        if (m) return m[1];
    }
    return null;
}

function extractNameFromUID (userIDs) {
    if (!userIDs || !userIDs.length) return null;
    const uid = userIDs[0];
    const m = uid.match (/^(.+?)\s*</);
    return m ? m[1].trim () : uid.trim () || null;
}

// ── Key metadata ──

/**
 * Extract metadata from a parsed key.
 * Compatible with openpgp.js v5 and v6 APIs.
 */
async function extractKeyMeta (key) {
    const fingerprint = key.getFingerprint ()
                           .toUpperCase ();
    const algo = key.getAlgorithmInfo ();
    const userIDs = key.getUserIDs ();

    // ── Expiration ──
    // openpgp v5: key.getExpirationTime() → Promise<Date|Infinity|null>
    // openpgp v6: key.getExpirationTime([date], [config]) → Promise<Date|typeof Infinity|null>
    //             Also can try key.keyPacket.getExpirationTime() for raw value
    let expires = null;
    try {
        // Try primary key expiration first
        let exp = null;

        // v6 API: getExpirationTime() may need no args or a date arg
        if (typeof key.getExpirationTime === "function") {
            try {
                exp = await key.getExpirationTime ();
            }
            catch {
                // v6 might require a userID arg
                try {
                    const uid = key.users?.[0]?.userID;
                    if (uid) exp = await key.getExpirationTime (uid);
                }
                catch {
                }
            }
        }

        // Parse result
        if (exp && exp !== Infinity && exp !== null) {
            let expDate;
            if (exp instanceof Date) {
                expDate = exp;
            }
            else if (typeof exp === "number") {
                // Unix timestamp (seconds)
                expDate = new Date (exp > 1e12 ? exp : exp * 1000);
            }
            else {
                expDate = new Date (exp);
            }
            if (!isNaN (expDate.getTime ()) && expDate.getFullYear () > 1970) {
                expires = expDate.toISOString ();
            }
        }

        // Fallback: check key packet directly for self-signature expiry
        if (!expires && key.keyPacket) {
            try {
                // Read from the primary key's self-signature
                const primaryUser = await key.getPrimaryUser?. ();
                const selfSig = primaryUser?.selfCertification;
                if (selfSig?.keyExpirationTime) {
                    const created = key.getCreationTime ();
                    const expDate = new Date (created.getTime () + selfSig.keyExpirationTime * 1000);
                    if (!isNaN (expDate.getTime ())) {
                        expires = expDate.toISOString ();
                    }
                }
            }
            catch {
            }
        }
    }
    catch {
    }

    // ── Creation time ──
    let created = null;
    try {
        const ct = key.getCreationTime ();
        if (ct instanceof Date) {
            created = ct.toISOString ();
        }
    }
    catch {
    }

    // ── Expired check ──
    let expired = false;
    try {
        if (typeof key.isExpired === "function") {
            const result = key.isExpired ();
            expired = result instanceof Promise ? await result : !!result;
        }
        // Double-check with parsed expiry date
        if (!expired && expires) {
            expired = new Date (expires).getTime () < Date.now ();
        }
    }
    catch {
    }

    return {
        fingerprint,
        keyId: fingerprint.slice (-16),
        algorithm: formatAlgorithm (algo),
        bits: algo.bits || null,
        curve: algo.curve || null,
        userIDs,
        uidEmail: extractEmailFromUID (userIDs),
        uidName: extractNameFromUID (userIDs),
        created,
        expires,
        isExpired: expired,
    };
}

function formatAlgorithm (algo) {
    if (!algo) return "Unknown";
    const name = algo.algorithm || "";
    if (name.includes ("eddsa") || name.includes ("ed25519")) return "Ed25519";
    if (name.includes ("ecdsa")) return `ECDSA (${algo.curve || "?"})`;
    if (name.includes ("rsa")) return `RSA-${algo.bits || "?"}`;
    return name || "Unknown";
}

// ── Key import & validation ──

export async function validateKey (armoredKey) {
    if (!armoredKey?.trim ()) return {valid: false, error: "No key provided"};
    if (!armoredKey.includes ("BEGIN PGP PRIVATE KEY")) {
        return {valid: false, error: "Not a PGP private key block"};
    }
    try {
        const key = await openpgp.readPrivateKey ({armoredKey});
        const meta = await extractKeyMeta (key);
        if (meta.isExpired) return {valid: false, error: "Key has expired", meta};
        return {valid: true, meta, needsPassphrase: !key.isDecrypted ()};
    }
    catch (err) {
        return {valid: false, error: `Failed to parse key: ${err.message}`};
    }
}

export async function importKey (armoredKey, passphrase = "") {
    let key;
    try {
        key = await openpgp.readPrivateKey ({armoredKey});
    }
    catch (err) {
        await logError ("gpg", `Key parse failed: ${err.message}`);
        return {ok: false, error: `Failed to parse key: ${err.message}`};
    }

    const meta = await extractKeyMeta (key);
    if (meta.isExpired) return {ok: false, error: "Key has expired", meta};

    if (!key.isDecrypted ()) {
        if (!passphrase) return {
            ok: false,
            error: "Key is encrypted — passphrase required",
            meta,
            needsPassphrase: true
        };
        try {
            key = await openpgp.decryptKey ({privateKey: key, passphrase});
        }
        catch (err) {
            await logError ("gpg", `Key decryption failed: ${err.message}`);
            return {ok: false, error: "Wrong passphrase or key decryption failed"};
        }
    }

    try {
        await storageSet (STORAGE_KEYS.GPG_KEY_ENC, key.armor ());
        await storageSet (STORAGE_KEYS.GPG_KEY_META, meta);
        cachedPrivateKey = key;

        await logInfo ("gpg", `Key imported: ${meta.algorithm} (${meta.keyId})`, {
            fingerprint: meta.fingerprint,
            uidEmail: meta.uidEmail,
        });
        return {ok: true, meta};
    }
    catch (err) {
        await logError ("gpg", `Key storage failed: ${err.message}`);
        return {ok: false, error: `Failed to store key: ${err.message}`};
    }
}

export async function getKeyMeta () {
    return storageGet (STORAGE_KEYS.GPG_KEY_META, null);
}

export async function removeKey () {
    cachedPrivateKey = null;
    await storageRemove (STORAGE_KEYS.GPG_KEY_ENC);
    await storageRemove (STORAGE_KEYS.GPG_KEY_META);
    await logInfo ("gpg", "GPG key removed");
}

async function loadPrivateKey () {
    if (cachedPrivateKey) return cachedPrivateKey;
    const armored = await storageGet (STORAGE_KEYS.GPG_KEY_ENC, null);
    if (!armored) return null;
    try {
        cachedPrivateKey = await openpgp.readPrivateKey ({armoredKey: armored});
        return cachedPrivateKey;
    }
    catch (err) {
        await logError ("gpg", `Failed to load stored key: ${err.message}`);
        return null;
    }
}

// ── Commit signing ──

/**
 * Build a Git commit object string for signing.
 *
 * CRITICAL for GitHub signature verification:
 *   - The payload signed must EXACTLY match what GitHub reconstructs internally
 *   - committer email MUST match the GPG key's UID email
 *   - timestamp used here MUST be identical to the one in the API call
 *   - The payload ends with the message followed by a single
 (Git convention)
 *   - Author ≠ Committer is allowed: author is who wrote the code,
 *     committer is who applied it (the key owner / signer)
 */
export function buildCommitPayload ({
                                        treeSha, parentSha,
                                        authorName, authorEmail,
                                        committerName, committerEmail,
                                        message, timestamp,
                                    }) {
    const ts = timestamp || Math.floor (Date.now () / 1000);
    const offset = "+0000";

    // Git commit object: each header on its own line,
    // blank line separates headers from message body,
    // message body ends with a single newline.
    return `tree ${treeSha}
` +
           `parent ${parentSha}
` +
           `author ${authorName} <${authorEmail}> ${ts} ${offset}
` +
           `committer ${committerName} <${committerEmail}> ${ts} ${offset}
` +
           `
` +
           message;
}

export async function signCommitPayload (payload) {
    const privateKey = await loadPrivateKey ();
    if (!privateKey) return {ok: false, error: "No GPG key loaded — import a key in Settings"};

    try {
        const message = await openpgp.createMessage ({text: payload});
        const signature = await openpgp.sign ({
                                                  message,
                                                  signingKeys: privateKey,
                                                  detached: true,
                                                  format: "armored",
                                              });
        await logInfo ("gpg", "Commit signed successfully");
        return {ok: true, signature};
    }
    catch (err) {
        await logError ("gpg", `Signing failed: ${err.message}`);
        return {ok: false, error: `Signing failed: ${err.message}`};
    }
}

export async function isSigningAvailable () {
    const meta = await getKeyMeta ();
    return meta !== null;
}
