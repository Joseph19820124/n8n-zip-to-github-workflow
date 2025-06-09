# API 文档

本文档详细描述了n8n ZIP to GitHub工作流中使用的各种API接口和数据结构。

## 📡 概述

工作流主要集成以下API服务：
- Google Drive API v3
- GitHub REST API v4
- n8n Webhook API
- 邮件发送API（SMTP）

## 🗂️ 数据结构

### ZipFileInfo

描述上传的ZIP文件信息

```typescript
interface ZipFileInfo {
  id: string;                    // Google Drive文件ID
  name: string;                  // 文件名
  mimeType: string;              // MIME类型
  size: number;                  // 文件大小（字节）
  modifiedTime: string;          // 最后修改时间（ISO 8601）
  webViewLink: string;           // Google Drive查看链接
  downloadUrl: string;           // 下载链接
}
```

### ExtractedFile

描述解压后的单个文件

```typescript
interface ExtractedFile {
  path: string;                  // 文件在ZIP中的相对路径
  name: string;                  // 文件名
  content: string;               // 文件内容（base64编码）
  size: number;                  // 文件大小（字节）
  compressedSize: number;        // 压缩后大小
  directory: string;             // 所在目录
  mimeType: string;              // MIME类型
  lastModified: Date;            // 最后修改时间
  checksum?: string;             // 文件校验和
}
```

### ProcessingResult

描述工作流处理结果

```typescript
interface ProcessingResult {
  success: boolean;              // 处理是否成功
  folderName: string;            // 生成的文件夹名
  extractedFiles: ExtractedFile[]; // 解压的文件列表
  fileCount: number;             // 文件总数
  fileStructure: object;         // 文件夹结构
  statistics: Statistics;        // 统计信息
  timestamp: string;             // 处理时间戳
  error?: string;                // 错误信息（如果失败）
}
```

### Statistics

文件处理统计信息

```typescript
interface Statistics {
  totalFiles: number;            // 总文件数
  totalSize: number;             // 总大小（字节）
  totalCompressedSize: number;   // 压缩后总大小
  fileTypes: Record<string, number>; // 文件类型分布
  directories: string[];         // 目录列表
  largestFile?: FileInfo;        // 最大文件信息
  smallestFile?: FileInfo;       // 最小文件信息
  averageFileSize: number;       // 平均文件大小
  compressionRatio: number;      // 压缩比（百分比）
}
```

### GitHubRepository

 GitHub仓库信息

```typescript
interface GitHubRepository {
  id: number;                    // 仓库ID
  name: string;                  // 仓库名
  full_name: string;             // 完整名称（owner/repo）
  description: string;           // 描述
  html_url: string;              // 仓库URL
  clone_url: string;             // 克隆URL
  created_at: string;            // 创建时间
  updated_at: string;            // 更新时间
  private: boolean;              // 是否私有
  default_branch: string;        // 默认分支
}
```

### UploadResults

GitHub文件上传结果

```typescript
interface UploadResults {
  successCount: number;          // 成功上传数量
  failedCount: number;           // 失败数量
  skippedCount: number;          // 跳过数量
  details: UploadDetail[];       // 详细结果
  totalSize: number;             // 总上传大小
}

interface UploadDetail {
  path: string;                  // 文件路径
  status: 'success' | 'failed' | 'skipped'; // 上传状态
  size?: number;                 // 文件大小
  error?: string;                // 错误信息
}
```

## 🔌 API接口

### Google Drive API

#### 文件监听

**监听文件夹变化**

```http
GET /drive/v3/files
Authorization: Bearer {access_token}
```

查询参数：
- `q`: 搜索查询（例如：`'folder_id' in parents and mimeType='application/zip'`）
- `fields`: 返回字段
- `orderBy`: 排序方式

#### 文件下载

**下载文件内容**

```http
GET /drive/v3/files/{fileId}?alt=media
Authorization: Bearer {access_token}
```

路径参数：
- `fileId`: Google Drive文件ID

#### 文件夹创建

**创建新文件夹**

```http
POST /drive/v3/files
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "name": "folder_name",
  "mimeType": "application/vnd.google-apps.folder",
  "parents": ["parent_folder_id"]
}
```

#### 文件上传

**上传文件到指定文件夹**

```http
POST /upload/drive/v3/files?uploadType=multipart
Authorization: Bearer {access_token}
Content-Type: multipart/related

{
  "name": "filename",
  "parents": ["folder_id"]
}
```

### GitHub API

#### 仓库创建

**创建新仓库**

```http
POST /user/repos
Authorization: Bearer {github_token}
Content-Type: application/json

{
  "name": "repository_name",
  "description": "Repository description",
  "private": false,
  "auto_init": true
}
```

#### 文件上传

**创建或更新文件**

```http
PUT /repos/{owner}/{repo}/contents/{path}
Authorization: Bearer {github_token}
Content-Type: application/json

{
  "message": "Commit message",
  "content": "base64_encoded_content",
  "branch": "main",
  "sha": "existing_file_sha" // 更新现有文件时需要
}
```

#### 仓库信息获取

**获取仓库详细信息**

```http
GET /repos/{owner}/{repo}
Authorization: Bearer {github_token}
```

### n8n Webhook API

#### 工作流触发

**触发工作流执行**

```http
POST /webhook/{webhook_id}
Content-Type: application/json

{
  "triggerType": "file_upload",
  "fileInfo": {
    "id": "drive_file_id",
    "name": "filename.zip",
    "size": 1024000
  }
}
```

#### 执行状态查询

**查询工作流执行状态**

```http
GET /api/v1/executions/{execution_id}
Authorization: Bearer {n8n_api_key}
```

## 📦 工具函数

### ZipProcessor 类

```typescript
class ZipProcessor {
  constructor(options?: ZipProcessorOptions);
  
  validateFile(fileInfo: ZipFileInfo): boolean;
  processZipFile(zipData: Buffer, fileName: string): Promise<ProcessingResult>;
  generateFolderName(fileName: string): string;
  extractAllFiles(zip: JSZip): Promise<ExtractedFile[]>;
  buildFileStructure(files: ExtractedFile[]): object;
  detectMimeType(filePath: string): string;
}

interface ZipProcessorOptions {
  maxFileSize?: number;          // 最大文件大小限制
  allowedExtensions?: string[];  // 允许的文件扩展名
  encoding?: string;             // 编码格式
}
```

### GitHubAgent 类

```typescript
class GitHubAgent {
  constructor(config: GitHubConfig);
  
  createRepositoryAndUploadFiles(
    folderName: string,
    files: ExtractedFile[],
    options?: CreateRepoOptions
  ): Promise<GitHubResult>;
  
  createRepository(repoName: string, options?: CreateRepoOptions): Promise<GitHubRepository>;
  uploadFilesToRepository(owner: string, repo: string, files: ExtractedFile[]): Promise<UploadResults>;
  createReadmeFile(owner: string, repo: string, files: ExtractedFile[]): Promise<void>;
}

interface GitHubConfig {
  githubToken: string;           // GitHub访问令牌
  owner: string;                 // 仓库所有者
  maxRetries?: number;           // 最大重试次数
  retryDelay?: number;           // 重试延迟（毫秒）
  batchSize?: number;            // 批处理大小
  rateLimitDelay?: number;       // API调用间隔
}

interface CreateRepoOptions {
  private?: boolean;             // 是否创建私有仓库
  description?: string;          // 仓库描述
  createReadme?: boolean;        // 是否创建README
  gitignoreTemplate?: string;    // .gitignore模板
  licenseTemplate?: string;      // 许可证模板
}
```

## 🚦 错误处理

### 标准错误响应

```typescript
interface ErrorResponse {
  success: false;
  error: string;                 // 错误描述
  code?: string;                 // 错误代码
  details?: any;                 // 详细信息
  timestamp: string;             // 错误时间
}
```

### 常见错误代码

| 错误代码 | 描述 | 解决方案 |
|---------|------|----------|
| `ZIP_INVALID` | ZIP文件格式无效 | 验证文件完整性 |
| `FILE_TOO_LARGE` | 文件超过大小限制 | 减小文件大小或调整限制 |
| `GITHUB_AUTH_FAILED` | GitHub认证失败 | 检查Token权限 |
| `GDRIVE_PERMISSION_DENIED` | Google Drive权限不足 | 重新授权OAuth |
| `RATE_LIMIT_EXCEEDED` | API调用频率超限 | 降低调用频率 |
| `NETWORK_ERROR` | 网络连接错误 | 检查网络连接 |

## 🔒 安全考虑

### 认证和授权

1. **GitHub Token安全**
   - 使用具有最小权限的Personal Access Token
   - 定期轮换Token
   - 避免在日志中记录Token信息

2. **Google Drive OAuth**
   - 使用OAuth 2.0流程
   - 限制访问范围（scope）
   - 安全存储refresh token

3. **环境变量管理**
   - 使用加密的环境变量存储
   - 避免在代码中硬编码敏感信息
   - 定期审查和更新凭据

### 数据保护

1. **传输安全**
   - 所有API调用使用HTTPS
   - 验证SSL证书
   - 使用TLS 1.2或更高版本

2. **数据处理**
   - 最小化敏感数据的内存存储时间
   - 及时清理临时文件
   - 对文件内容进行病毒扫描（建议）

## 📊 监控和指标

### 关键性能指标（KPI）

```typescript
interface WorkflowMetrics {
  executionCount: number;        // 执行次数
  successRate: number;           // 成功率
  averageProcessingTime: number; // 平均处理时间
  filesProcessed: number;        // 处理文件总数
  dataTransferred: number;       // 传输数据量
  errorCount: number;            // 错误次数
  apiCallCount: number;          // API调用次数
}
```

### 日志记录

```typescript
interface LogEntry {
  timestamp: string;             // 时间戳
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'; // 日志级别
  component: string;             // 组件名称
  message: string;               // 日志消息
  metadata?: object;             // 附加元数据
  executionId?: string;          // 执行ID
}
```

## 🧪 测试接口

### 测试工具函数

```typescript
// 测试ZIP处理功能
function testZipProcessing(zipBuffer: Buffer): Promise<ProcessingResult>;

// 测试GitHub API连接
function testGitHubConnection(token: string): Promise<boolean>;

// 测试Google Drive API连接
function testGoogleDriveConnection(credentials: object): Promise<boolean>;

// 端到端测试
function runE2ETest(testZipPath: string): Promise<TestResult>;
```

---

本API文档将随着工作流的更新而持续维护。如有疑问或建议，请提交Issue。