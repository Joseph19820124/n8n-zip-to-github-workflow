# n8n ZIP to GitHub 工作流配置指南

本指南将详细介绍如何配置和部署这个自动化工作流系统。

## 📋 前置条件

### 必需的服务和账户

1. **n8n实例** - 自托管或云版本
2. **Google账户** - 用于Google Drive API访问
3. **GitHub账户** - 用于代码仓库管理
4. **邮箱服务** - 用于通知（可选）

### 技术要求

- Node.js 16.0.0 或更高版本
- npm 8.0.0 或更高版本
- n8n 1.0.0 或更高版本

## 🔧 第一步：环境配置

### 1.1 克隆仓库

```bash
git clone https://github.com/Joseph19820124/n8n-zip-to-github-workflow.git
cd n8n-zip-to-github-workflow
```

### 1.2 安装依赖

```bash
npm install
```

### 1.3 环境变量配置

复制环境变量模板：

```bash
cp .env.example .env
```

编辑 `.env` 文件并填入你的配置信息：

```bash
# Google Drive 配置
GOOGLE_DRIVE_SOURCE_FOLDER_ID=1ABC...XYZ
GOOGLE_DRIVE_TARGET_FOLDER_ID=1DEF...UVW

# GitHub 配置
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_OWNER=your_username

# 邮件通知配置
NOTIFICATION_EMAIL_FROM=automation@yourdomain.com
NOTIFICATION_EMAIL_TO=admin@yourdomain.com
```

## 🔐 第二步：API认证配置

### 2.1 Google Drive API配置

1. **前往Google Cloud Console**
   - 访问 [Google Cloud Console](https://console.cloud.google.com/)
   - 创建新项目或选择现有项目

2. **启用Google Drive API**
   ```bash
   # 在Cloud Console中搜索并启用以下API：
   - Google Drive API
   - Google Sheets API（可选）
   ```

3. **创建OAuth2凭据**
   - 进入「凭据」页面
   - 点击「创建凭据」→「OAuth 2.0 客户端ID」
   - 应用类型选择「Web应用程序」
   - 添加重定向URI：`http://localhost:5678/rest/oauth2-credential/callback`

4. **获取客户端信息**
   ```json
   {
     "client_id": "your_client_id.apps.googleusercontent.com",
     "client_secret": "your_client_secret"
   }
   ```

### 2.2 GitHub Personal Access Token

1. **访问GitHub设置**
   - 登录GitHub
   - 进入 Settings → Developer settings → Personal access tokens

2. **创建新Token**
   ```bash
   # 选择以下权限范围：
   ✅ repo (完整仓库访问权限)
   ✅ workflow (工作流权限)
   ✅ admin:org (组织管理权限，如果需要)
   ```

3. **保存Token**
   ```bash
   # 格式通常为：
   ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

### 2.3 获取Google Drive文件夹ID

1. **创建源文件夹**
   - 在Google Drive中创建 `unzipAndPushToGithub` 文件夹
   - 从URL中提取文件夹ID：`https://drive.google.com/drive/folders/[FOLDER_ID]`

2. **创建目标文件夹**
   - 创建用于存储解压文件的目标文件夹
   - 同样提取文件夹ID

## ⚙️ 第三步：n8n工作流配置

### 3.1 导入工作流

1. **打开n8n界面**
   ```bash
   # 如果是本地部署
   npx n8n
   
   # 或者访问你的n8n云实例
   ```

2. **导入工作流文件**
   - 点击「+」创建新工作流
   - 选择「从文件导入」
   - 上传 `configs/n8n-workflow.json`

### 3.2 配置节点凭据

1. **Google Drive节点配置**
   ```bash
   # 对于每个Google Drive节点：
   1. 点击节点
   2. 选择「凭据」→「创建新凭据」
   3. 输入OAuth2客户端ID和密钥
   4. 完成OAuth授权流程
   ```

2. **代码节点配置**
   ```javascript
   // 确保代码节点中包含正确的环境变量引用
   const githubToken = process.env.GITHUB_TOKEN;
   const githubOwner = process.env.GITHUB_OWNER;
   ```

### 3.3 环境变量配置

在n8n中设置环境变量：

```bash
# 方法1：通过Docker环境变量
docker run -e GITHUB_TOKEN=your_token -e GITHUB_OWNER=your_username n8n

# 方法2：通过.env文件（本地部署）
export GITHUB_TOKEN=your_token
export GITHUB_OWNER=your_username
```

## 🧪 第四步：测试工作流

### 4.1 手动测试

1. **准备测试文件**
   ```bash
   # 创建一个测试ZIP文件
   mkdir test-project
   echo "console.log('Hello World');" > test-project/index.js
   echo "# Test Project" > test-project/README.md
   zip -r test-project.zip test-project/
   ```

2. **上传到监听文件夹**
   - 将 `test-project.zip` 上传到Google Drive的源文件夹
   - 观察n8n工作流的执行日志

3. **验证结果**
   ```bash
   # 检查以下结果：
   ✅ Google Drive中创建了新的解压文件夹
   ✅ GitHub中创建了新的仓库
   ✅ 所有文件都正确上传到GitHub
   ✅ 收到了邮件通知（如果配置了）
   ```

### 4.2 自动化测试

创建测试脚本：

```javascript
// test/workflow-test.js
const fs = require('fs');
const path = require('path');

// 测试文件上传逻辑
async function testWorkflow() {
    console.log('开始工作流测试...');
    
    // 这里添加你的测试逻辑
    
    console.log('测试完成');
}

testWorkflow().catch(console.error);
```

## 🚀 第五步：生产部署

### 5.1 安全配置

1. **密钥管理**
   ```bash
   # 使用密钥管理服务
   # 避免在代码中硬编码敏感信息
   ```

2. **权限最小化**
   ```bash
   # GitHub Token权限
   - 只授予必要的仓库权限
   - 定期轮换Token
   
   # Google Drive权限
   - 限制文件夹访问范围
   - 使用服务账户而非个人账户
   ```

### 5.2 监控和日志

1. **配置日志级别**
   ```javascript
   // 在n8n中启用详细日志
   console.log('DEBUG:', 'Detailed debug information');
   console.error('ERROR:', 'Error details');
   ```

2. **设置监控**
   ```bash
   # 监控关键指标：
   - 工作流执行成功率
   - 文件处理速度
   - API调用频率
   - 错误发生频率
   ```

### 5.3 性能优化

1. **并发处理**
   ```javascript
   // 在代码节点中优化批处理
   const batchSize = 10;
   const batches = chunk(files, batchSize);
   
   for (const batch of batches) {
       await Promise.all(batch.map(file => processFile(file)));
   }
   ```

2. **缓存机制**
   ```javascript
   // 避免重复处理相同文件
   const processedFiles = new Set();
   
   if (processedFiles.has(fileHash)) {
       console.log('文件已处理，跳过');
       return;
   }
   ```

## 🔍 故障排除

### 常见问题及解决方案

1. **ZIP文件解压失败**
   ```bash
   错误：ZIP文件损坏或格式不支持
   解决：验证文件完整性，检查文件大小限制
   ```

2. **GitHub API调用失败**
   ```bash
   错误：401 Unauthorized
   解决：检查Token权限，验证Token是否过期
   ```

3. **Google Drive权限问题**
   ```bash
   错误：403 Forbidden
   解决：重新授权OAuth，检查文件夹共享权限
   ```

### 调试技巧

1. **启用详细日志**
   ```javascript
   // 在代码节点中添加调试信息
   console.log('当前处理文件:', file.name);
   console.log('文件大小:', file.size);
   console.log('MIME类型:', file.mimeType);
   ```

2. **分步测试**
   ```bash
   # 逐个测试工作流节点
   1. 测试文件监听触发
   2. 测试ZIP下载
   3. 测试解压缩功能
   4. 测试GitHub API调用
   ```

## 📞 技术支持

如果遇到问题，请：

1. 检查[常见问题](docs/faq.md)
2. 查看[GitHub Issues](https://github.com/Joseph19820124/n8n-zip-to-github-workflow/issues)
3. 提交新的Issue并包含：
   - 详细的错误信息
   - 系统环境信息
   - 重现步骤
   - 相关日志

---

完成以上配置后，你的自动化工作流就可以正常运行了！🎉