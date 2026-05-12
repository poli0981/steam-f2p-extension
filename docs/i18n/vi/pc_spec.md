# Cấu hình máy của Developer

> **Lưu ý:** Đây là máy phát triển cá nhân của maintainer. Cấu hình này dùng
> chung cho **tất cả** các dự án mà developer ([poli0981](https://github.com/poli0981))
> đang làm — đây **không phải** yêu cầu tối thiểu để chạy hoặc đóng góp cho
> extension này. Người dùng cuối chỉ cần một trình duyệt nền Chromium
> (xem [REQUIREMENTS.md](../../../REQUIREMENTS.md)).

Bản tiếng Anh: [docs/pc_spec.md](../../pc_spec.md).

## Máy phát triển chính

| Thành phần | Chi tiết |
|------------|----------|
| **Hệ điều hành** | Windows 11 Pro 25H2 Insider Preview (Dev Channel) |
| **Build** | 26300.8376 |
| **CPU** | Intel Core i7-14700KF |
| **GPU** | NVIDIA GeForce RTX 5080 (16 GB VRAM) |
| **RAM** | 32 GB DDR5 |
| **Storage** | 1 TB SSD |
| **IDE** | JetBrains IDEs (bản trả phí) 2026.x + VS Code |

## Thiết bị di động dùng để test web

- iPhone 14 Pro — iOS 26.x — Chrome, Brave
- iPhone 13 Pro Max — iOS 26.x — Chrome, Brave

## Toolchain trên máy phát triển

Chỉ liệt kê các toolchain đang được dùng thực tế cho ít nhất một dự án của
developer. Nếu một runtime/SDK không được dự án nào pull thì nó cũng không
liên quan tới dự án đó — xem [dev_env.md](dev_env.md) để biết extension này
cần gì cụ thể.

- Python 3.12.x, 3.14.x
- Node.js >= 25.8.1
- Rust stable (qua rustup)
- Git (mới) với GPG signing bật (`commit.gpgsign=true`)
- .NET 8.x, 9.x, 10.x, 11.x (preview)

Các phiên bản runtime/SDK mới sẽ được liệt kê tại đây khi có dự án thực sự
chuyển sang dùng.

## Tài liệu liên quan trong repo

| Tài liệu | Mục đích |
|----------|----------|
| [dev_env.md](dev_env.md) | IDE + toolchain + workflow cho riêng extension này (bản tiếng Việt) |
| [../../pc_spec.md](../../pc_spec.md) | Bản tiếng Anh của file này |
| [../../dev_env.md](../../dev_env.md) | Bản tiếng Anh của dev_env |
| [../../../REQUIREMENTS.md](../../../REQUIREMENTS.md) | Yêu cầu runtime cho người dùng cuối |
