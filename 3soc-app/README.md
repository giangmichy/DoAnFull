np # 3SOC Detection - Mobile App

React Native (Expo) mobile app cho hệ thống phát hiện vi phạm AI.

## Cài đặt

```bash
cd 3soc-app
npm install
```

## Cấu hình

Sửa file `src/config.ts` để trỏ đến backend:

- **Android Emulator**: `http://10.0.2.2:8000/api` (mặc định)
- **iOS Simulator**: `http://localhost:8000/api`
- **Thiết bị thật**: `http://<IP-máy-tính>:8000/api`

## Chạy app

```bash
npx expo start
```

Sau đó nhấn `a` (Android) hoặc `i` (iOS) hoặc scan QR bằng Expo Go.

## Chức năng

- Đăng nhập / Đăng xuất (JWT)
- Phát hiện vi phạm (ảnh/video) với 3 model YOLO
- Quản lý file video (upload, detect, xóa)
- Quản lý người dùng (admin)
- Cài đặt tài khoản, đổi mật khẩu
