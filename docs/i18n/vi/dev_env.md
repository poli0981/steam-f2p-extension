# Môi trường phát triển

Hướng dẫn dựng môi trường local để làm việc trên Steam F2P Tracker extension.
Tài liệu này chỉ nói về extension này; cấu hình phần cứng tổng quát của
maintainer ở [pc_spec.md](pc_spec.md).

Bản tiếng Anh: [docs/dev_env.md](../../dev_env.md).

## IDE

Editor nào cũng được. Maintainer dùng:

- **JetBrains IDEs 2026.x** (bản trả phí) — WebStorm cho extension này,
  RustRover / PyCharm / Rider cho các dự án khác (không dùng ở đây).
- **VS Code** — phương án nhẹ thay thế.

Repo không commit cấu hình IDE riêng. ESLint / Prettier không được wire vào —
codebase giữ style theo quy ước (xem CONTRIBUTING.md).

## Toolchain bắt buộc

Extension này là JS thuần, không có build step. Chỉ cần:

| Công cụ | Dùng để | Tối thiểu |
|---------|---------|-----------|
| Trình duyệt nền Chromium | Load extension chưa đóng gói | Chrome 120+ (MV3) |
| Node.js | `node --check` để validate cú pháp trước commit | Node 20+ |
| `jq` | Validate `manifest.json` / file JSONL | bản mới |
| Git | Source control | bản mới |
| GPG | Ký commit và release tag (`commit.gpgsign=true`) | 2.4+ |
| pinentry-Qt (hoặc tương đương) | Mở khoá GPG key khi ký tag | khớp GPG |

Máy của maintainer có sẵn Python, Rust, .NET nhưng không cái nào cần thiết
cho riêng extension này.

## Cấu trúc dự án (mức cao)

```
manifest.json           Chrome MV3 manifest, là nơi giữ version chính
background/             Service worker + GitHub + GPG + queue modules
content/                Scraper trang Steam (IIFE, không phải module)
popup/ queue/ settings/ Ba page của extension
shared/                 Constants, wrapper storage, helpers, theme.css
lib/                    openpgp.min.mjs + InterVariable.woff2 (vendored)
docs/                   Tài liệu pháp lý + tài liệu dev (chính file này)
scripts/                Đích JSONL nằm ở tracker repo, không phải repo này
.github/                Workflow, dependabot, FUNDING, issue template
```

Xem [phần Architecture trong README.md](../../../README.md#architecture) để
hiểu luồng dữ liệu runtime.

## Load extension ở local

1. Clone repo (hoặc `git pull` nhánh `main` mới nhất).
2. Mở `chrome://extensions/`.
3. Bật **Developer mode** (góc trên-phải).
4. **Load unpacked** → chọn thư mục gốc repo.
5. Sau mỗi thay đổi, bấm icon **Reload** trên card extension.

## Workflow gợi ý

1. Tạo nhánh tên `<type>/<slug>-v<x.y.z>`. Các type: `feat`, `fix`,
   `refactor`, `chore`, `docs`, `ci`.
2. Sửa code. Với mỗi file JS đã đổi, chạy `node --check path/file.js` trước
   khi stage.
3. Validate `manifest.json` bằng `jq -e .version manifest.json`.
4. Bump trường `"version"` trong `manifest.json` và thêm section mới vào
   `CHANGELOG.md` nếu thay đổi sẽ được release.
5. Commit. Maintainer ký commit bằng GPG key của mình; chưa có pre-commit
   hook, nhưng release tag thì luôn được ký.
6. Mở PR. Hiện CI surface khá nhẹ (workflow Release chỉ chạy khi push tag).
   PR-time validation đang được dự kiến ra cùng v2.5.0.

## Release

Xem mục "Standard shipping flow" trong v2-roadmap (note nội bộ, không
commit). Bản gọn:

```
git tag -s vX.Y.Z -m "release notes..."
git push origin vX.Y.Z
```

Workflow Release sẽ build ZIP và tạo GitHub release với annotation của tag
làm body. Từ v1.14.0 thêm: tự tạo Discussion ở category `Announcements`.

## Lệnh hay dùng

```bash
# Kiểm tra cú pháp toàn bộ file JS (bỏ qua lib/ vendored)
find . -name '*.js' -not -path './lib/*' -not -path './.git/*' \
  -exec node --check {} \;

# Verify mọi file JSON parse được
find . -name '*.json' -not -path './.git/*' \
  -exec sh -c 'jq -e . "$1" >/dev/null || echo "BAD: $1"' _ {} \;
```
