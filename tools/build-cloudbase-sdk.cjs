// CloudBase Web SDK 浏览器全局打包入口（esbuild 把 ESM 打成 IIFE，暴露 window.cloudbase）
// 仓库外安装 esbuild 与 @cloudbase/js-sdk 后，执行：
//   npx esbuild tools/build-cloudbase-sdk.cjs --bundle --format=iife --global-name=cloudbase \
//     --platform=browser --minify --outfile=dist/assets/js/cloudbase.js
const cloudbase = require("@cloudbase/js-sdk");
module.exports = cloudbase;
