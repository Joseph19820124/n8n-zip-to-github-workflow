# 常见问题解答 (FAQ)

这里收集了使用n8n ZIP to GitHub工作流时遇到的常见问题和解决方案。

## 🔧 安装和配置

### Q: 如何获取Google Drive文件夹ID？

**A:** 
1. 在Google Drive中打开目标文件夹
2. 从浏览器地址栏复制URL
3. 文件夹ID是URL中 `/folders/` 后面的字符串
   ```
   https://drive.google.com/drive/folders/1ABC...XYZ
                                        ↑
                                   这就是文件夹ID
   ```

### Q: GitHub Personal Access Token需要哪些权限？

**A:** 至少需要以下权限：
- ✅ `repo` - 完整仓库访问权限
- ✅ `workflow` - 工作流权限（如果需要）
- ✅ `admin:org` - 组织管理权限（如果要在组织下创建仓库）

### Q: n8n环境变量在哪里设置？

**A:** 有几种方式：

1. **Docker环境**：
   ```bash
   docker run -e GITHUB_TOKEN=xxx -e GITHUB_OWNER=xxx n8n
   ```

2. **本地部署**：
   ```bash
   export GITHUB_TOKEN=your_token
   export GITHUB_OWNER=your_username
   npx n8n
   ```

3. **n8n Cloud**：在Settings → Environment Variables中设置

## 📁 文件处理

### Q: 支持哪些压缩格式？

**A:** 目前只支持标准的ZIP格式（.zip）。不支持：
- ❌ RAR (.rar)
- ❌ 7-Zip (.7z)
- ❌ TAR (.tar, .tar.gz)

### Q: 文件大小限制是多少？

**A:** 默认限制：
- **ZIP文件**: 100MB
- **单个文件**: 受GitHub API限制，通常为100MB
- **总仓库大小**: 受GitHub仓库大小限制

可以通过环境变量调整：
```bash
MAX_FILE_SIZE=52428800  # 50MB
```

### Q: 如何处理包含特殊字符的文件名？

**A:** 工作流会自动处理：
- 移除或替换不兼容的字符
- 转换为小写
- 用连字符替换空格
- 确保符合GitHub仓库命名规范

## 🔄 工作流执行

### Q: 工作流执行失败，如何调试？

**A:** 按以下步骤排查：

1. **检查n8n执行日志**：
   ```javascript
   console.log('调试信息:', {
       fileName: file.name,
       fileSize: file.size,
       error: error.message
   });
   ```

2. **验证环境变量**：
   - 确认GITHUB_TOKEN有效且未过期
   - 验证GITHUB_OWNER正确
   - 检查Google Drive权限

3. **测试单个节点**：
   - 手动触发每个节点
   - 检查数据传递是否正确

### Q: 为什么有些文件上传失败？

**A:** 常见原因：

1. **文件名冲突**：
   - GitHub不允许同路径下的同名文件
   - 解决：启用文件覆盖或重命名

2. **API速率限制**：
   - GitHub API有频率限制
   - 解决：增加批次间延迟

3. **文件内容问题**：
   - 二进制文件编码错误
   - 解决：检查base64编码

### Q: 工作流可以并发处理多个ZIP文件吗？

**A:** 建议配置：
- 单个工作流实例顺序处理
- 可以运行多个工作流实例
- 注意GitHub API速率限制

## 🐙 GitHub集成

### Q: 如何自定义仓库名称规则？

**A:** 在GitHub集成代码中修改：

```javascript
// 添加时间戳
const timestamp = new Date().toISOString().slice(0, 10);
const repoName = `${folderName}-${timestamp}`;

// 添加前缀
const repoName = `n8n-${folderName}`;

// 添加随机后缀
const randomSuffix = Math.random().toString(36).substring(7);
const repoName = `${folderName}-${randomSuffix}`;
```

### Q: 如何设置仓库为私有？

**A:** 在工作流配置中修改：

```javascript
const result = await agent.createRepositoryAndUploadFiles(
    folderName,
    extractedFiles,
    {
        private: true,  // 设置为私有仓库
        createReadme: true,
        description: `私有仓库: ${folderName}`
    }
);
```

### Q: 能否推送到现有仓库而不是创建新仓库？

**A:** 可以修改代码实现：

```javascript
// 不创建新仓库，直接上传到现有仓库
const uploadResults = await agent.uploadFilesToRepository(
    owner,
    existingRepoName,  // 现有仓库名
    extractedFiles
);
```

## ⚠️ 错误处理

### Q: 出现 "403 Forbidden" 错误怎么办？

**A:** 可能原因和解决方案：

1. **GitHub Token权限不足**：
   - 检查Token权限范围
   - 重新生成Token

2. **Google Drive权限问题**：
   - 重新授权OAuth
   - 检查文件夹共享权限

3. **API速率限制**：
   - 降低请求频率
   - 增加重试延迟

### Q: 出现 "ZIP文件损坏" 错误怎么办？

**A:** 排查步骤：

1. **验证原文件**：
   - 尝试手动解压ZIP文件
   - 使用不同的压缩工具重新创建ZIP

2. **检查文件传输**：
   - 确认上传过程中文件未损坏
   - 检查文件大小是否一致

3. **编码问题**：
   - 确保使用UTF-8文件名
   - 避免特殊字符

### Q: 内存不足错误怎么解决？

**A:** 优化建议：

1. **增加n8n内存限制**：
   ```bash
   N8N_PAYLOAD_SIZE_MAX=104857600  # 100MB
   ```

2. **分批处理文件**：
   ```javascript
   const batchSize = 5;  // 减少批次大小
   ```

3. **优化文件处理**：
   - 及时释放大文件内存
   - 使用流式处理

## 🔒 安全问题

### Q: 如何保护敏感信息？

**A:** 安全最佳实践：

1. **使用环境变量**：
   - 从不在代码中硬编码密钥
   - 使用n8n凭据管理器

2. **定期轮换密钥**：
   - 设置GitHub Token过期时间
   - 定期更新OAuth凭据

3. **最小权限原则**：
   - 只授予必需的权限
   - 限制文件夹访问范围

### Q: 如何防止恶意文件上传？

**A:** 安全措施：

1. **文件类型验证**：
   ```javascript
   const allowedTypes = ['.js', '.json', '.md', '.txt'];
   if (!allowedTypes.includes(fileExtension)) {
       throw new Error('不允许的文件类型');
   }
   ```

2. **文件大小限制**：
   ```javascript
   if (fileSize > MAX_FILE_SIZE) {
       throw new Error('文件过大');
   }
   ```

3. **内容扫描**（可选）：
   - 集成病毒扫描API
   - 检查文件内容安全性

## 🚀 性能优化

### Q: 如何提高处理速度？

**A:** 优化策略：

1. **并发处理**：
   ```javascript
   const concurrency = 3;
   const chunks = _.chunk(files, concurrency);
   
   for (const chunk of chunks) {
       await Promise.all(chunk.map(file => processFile(file)));
   }
   ```

2. **缓存机制**：
   ```javascript
   const processedFiles = new Map();
   if (processedFiles.has(fileHash)) {
       return processedFiles.get(fileHash);
   }
   ```

3. **优化API调用**：
   - 批量上传文件
   - 减少不必要的API调用
   - 使用适当的延迟

### Q: 大型项目处理慢怎么办？

**A:** 针对大型项目的优化：

1. **分层处理**：
   - 按目录分批处理
   - 优先处理重要文件

2. **进度监控**：
   ```javascript
   console.log(`处理进度: ${current}/${total} (${percentage}%)`);
   ```

3. **断点续传**：
   - 记录处理进度
   - 支持从失败点继续

## 📞 技术支持

### Q: 遇到问题如何获取帮助？

**A:** 获取支持的步骤：

1. **检查此FAQ文档**
2. **查看[GitHub Issues](https://github.com/Joseph19820124/n8n-zip-to-github-workflow/issues)**
3. **提交新Issue时请包含**：
   - 详细的错误信息
   - 重现步骤
   - 系统环境信息
   - 相关日志

### Q: 如何报告Bug？

**A:** Bug报告模板：

```markdown
## Bug描述
[简述问题]

## 重现步骤
1. ...
2. ...
3. ...

## 预期行为
[描述预期结果]

## 实际行为
[描述实际结果]

## 环境信息
- n8n版本: 
- Node.js版本: 
- 操作系统: 
- 浏览器: 

## 错误日志
```
[粘贴错误日志]
```

## 附加信息
[任何其他相关信息]
```

---

如果这个FAQ没有回答你的问题，请[提交新的Issue](https://github.com/Joseph19820124/n8n-zip-to-github-workflow/issues/new)！