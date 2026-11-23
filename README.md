# Pixel Dynasty (Triều Đại Pixel)

Game chiến thuật thời gian thực (RTS) phong cách **Pixel Art Á Đông (Việt Nam – Trung Quốc)** tối ưu cho iPhone (nhịp trận 10–15 phút, 4 tài nguyên, 4 thời kỳ, AI 1v1–1v3, Wi-Fi LAN và Online).

## Cấu trúc Monorepo

- `web/`: Lõi mô phỏng Fixed-Tick 20 Hz + giao diện **Phaser 3 + TypeScript + Vite**. Tự động triển khai lên **GitHub Pages** để mở Safari trên iPhone chơi thử ngay sau ~15 giây.
- `ios/`: Lớp vỏ **Swift + WKWebView** đóng gói offline qua `WKURLSchemeHandler` (chuẩn App Store Guideline 4.2), tích hợp `CoreHaptics`, `Network` framework (LAN Bonjour) và tự sinh dự án qua `XcodeGen` (`ios/project.yml`).
- `server/`: Máy chủ **Node.js + Colyseus** chuyển tiếp lệnh đồng bộ (Deterministic Lockstep) cho chế độ Online 2–4 người chơi.
- `.github/workflows/`:
  - `deploy-web-pages.yml`: Tự động build `/web` và xuất bản lên GitHub Pages.
  - `build-ios-ipa.yml`: Tự động build `/web`, nhúng vào `/ios/PixelDynasty/WebBundle`, chạy `xcodegen generate` trên `macos-15` và xuất tệp `.ipa` (hỗ trợ cả bản Unsigned `.ipa` test nhanh lẫn ký đẩy TestFlight).

## Hướng dẫn khởi chạy chỉ bằng GitHub và iPhone

1. **Tạo kho GitHub mới** (ví dụ `pixel-dynasty`) và tải toàn bộ thư mục này lên nhánh `main`.
2. **Bật GitHub Pages**: Vào **Settings → Pages → Build and deployment → Source: GitHub Actions**. Từ lúc này, mỗi khi sửa `units.json`, `buildings.json`, `factions.json` hoặc mã trong `web/`, Safari trên iPhone sẽ có bản mới sau ~15 giây.
3. **Biên dịch file `.ipa` không cần máy Mac**: Vào tab **Actions → Build iOS IPA (Pixel Dynasty) → Run workflow** để tải tệp `PixelDynasty-unsigned.ipa` về iPhone ký và cài thử.
4. **Đẩy tự động lên TestFlight (App Store)**: Cấu hình các biến bảo mật (Secrets) trong `Settings → Secrets and variables → Actions`:
   - `APPLE_CERT_BASE64`, `APPLE_CERT_PASSWORD`, `APPLE_PROVISION_PROFILE_BASE64`, `APPLE_TEAM_ID`
   - `APPSTORE_API_KEY_ID`, `APPSTORE_API_ISSUER_ID`, `APPSTORE_API_PRIVATE_KEY`
