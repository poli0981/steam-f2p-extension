// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Namespace initializer for the Steam F2P content-script modules.
 *
 * MV3 content scripts listed in manifest.content_scripts.js run as classic
 * scripts in the same isolated world. Each extract-*.js file attaches its
 * functions to globalThis.SF2P so the orchestrator (detector.js) can call
 * them without ES module imports.
 *
 * This file MUST be listed first in manifest.content_scripts.js.
 */

(function () {
    "use strict";
    globalThis.SF2P = globalThis.SF2P || {};
})();
