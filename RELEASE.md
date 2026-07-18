# ReadFlow 发布与自动更新

ReadFlow 的自动更新由 Tauri Updater 校验。更新包必须使用本机的签名私钥签名；私钥位于 `/Users/fanpeng/.tauri/readflow-updater.key`，不得提交、上传或分享。丢失私钥后，已安装版本无法验证后续更新。

## 发布 v0.1.4 及后续版本

1. 同步修改 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 的版本号。
2. 运行自动检查：

   ```bash
   npm run typecheck
   cargo test --manifest-path src-tauri/Cargo.toml
   ```

3. 构建 macOS 包和更新归档：

   ```bash
   npm run tauri -- build --bundles dmg
   ```

4. 显式签名更新归档。当前 CLI 需要显式传入空密码，私钥本身未设置密码：

   ```bash
   npm run tauri signer sign -- \
     --private-key-path /Users/fanpeng/.tauri/readflow-updater.key \
     --password "" \
     src-tauri/target/release/bundle/macos/ReadFlow.app.tar.gz
   ```

5. 生成更新清单。`--notes` 使用本次面向用户的更新说明：

   ```bash
   npm run release:manifest -- \
     --version 0.1.4 \
     --signature src-tauri/target/release/bundle/macos/ReadFlow.app.tar.gz.sig \
     --output /tmp/latest.json \
     --notes "版本与自动更新"
   ```

6. 在 GitHub 创建并发布对应标签（例如 `v0.1.4`），上传以下文件：

   - `src-tauri/target/release/bundle/dmg/ReadFlow_0.1.4_aarch64.dmg`
   - `src-tauri/target/release/bundle/macos/ReadFlow.app.tar.gz`
   - `/tmp/latest.json`，上传时文件名必须保留为 `latest.json`

签名内容已写入 `latest.json`，无需把 `.sig` 文件公开上传。应用从 GitHub 最新 Release 的 `latest.json` 获取版本、下载地址和签名，并只安装签名通过的更新包。

## 行为说明

- 设置页显示当前版本，打开设置会自动检查一次；用户也可以手动检查。
- 发现更新后，用户点击“下载并安装”才会下载、替换并重启应用，不会静默下载。
- `v0.1.3` 尚未内置更新器，必须手动安装首次包含该功能的 `v0.1.4`；此后版本可通过应用更新。
- 当前只发布 Apple Silicon（`darwin-aarch64`）更新包。Developer ID 签名与公证仍是独立的后续工作。
