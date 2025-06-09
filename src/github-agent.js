/**
 * AI Agent GitHub集成模块
 * 
 * 负责自动创建GitHub仓库并批量上传文件，
 * 支持错误处理、重试机制和进度监控。
 * 
 * @author n8n-automation
 * @version 1.0.0
 */

/**
 * GitHub操作代理类
 */
class GitHubAgent {
    constructor(config) {
        this.githubToken = config.githubToken;
        this.mcpServerUrl = config.mcpServerUrl;
        this.owner = config.owner;
        this.maxRetries = config.maxRetries || 3;
        this.retryDelay = config.retryDelay || 1000;
        this.batchSize = config.batchSize || 10;
        
        // API速率限制配置
        this.rateLimitDelay = config.rateLimitDelay || 100;
        this.lastRequestTime = 0;
    }

    /**
     * 主要处理方法：创建仓库并上传文件
     * @param {String} folderName - 文件夹名称
     * @param {Array} extractedFiles - 提取的文件列表
     * @param {Object} options - 可选配置
     * @returns {Promise<Object>} 处理结果
     */
    async createRepositoryAndUploadFiles(folderName, extractedFiles, options = {}) {
        const startTime = Date.now();
        
        try {
            console.log(`🚀 开始为文件夹 "${folderName}" 创建GitHub仓库并上传文件...`);
            console.log(`📊 待处理文件数量: ${extractedFiles.length}`);
            
            // 验证输入参数
            this.validateInput(folderName, extractedFiles);
            
            // 步骤1: 创建GitHub仓库
            const repoData = await this.createRepository(folderName, options);
            console.log(`✅ 成功创建仓库: ${repoData.html_url}`);
            
            // 等待仓库初始化完成
            await this.waitForRepositoryReady(this.owner, folderName);
            
            // 步骤2: 批量上传文件
            const uploadResults = await this.uploadFilesToRepository(
                this.owner, 
                folderName, 
                extractedFiles,
                options
            );
            
            // 步骤3: 创建README文件
            if (options.createReadme !== false) {
                await this.createReadmeFile(this.owner, folderName, extractedFiles);
            }
            
            // 计算处理时间
            const processingTime = Date.now() - startTime;
            
            const result = {
                success: true,
                repository: repoData,
                uploadResults: uploadResults,
                processingTime: processingTime,
                message: `成功创建仓库 ${folderName} 并上传 ${uploadResults.successCount} 个文件`,
                timestamp: new Date().toISOString()
            };
            
            console.log(`🎉 处理完成! 耗时: ${processingTime}ms`);
            return result;
            
        } catch (error) {
            console.error(`❌ 处理失败: ${error.message}`);
            
            return {
                success: false,
                error: error.message,
                folderName: folderName,
                fileCount: extractedFiles.length,
                processingTime: Date.now() - startTime,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * 验证输入参数
     * @param {String} folderName - 文件夹名称
     * @param {Array} extractedFiles - 文件列表
     */
    validateInput(folderName, extractedFiles) {
        if (!folderName || typeof folderName !== 'string') {
            throw new Error('文件夹名称不能为空');
        }
        
        if (!Array.isArray(extractedFiles) || extractedFiles.length === 0) {
            throw new Error('文件列表不能为空');
        }
        
        // 验证GitHub仓库名称规则
        if (!/^[a-zA-Z0-9._-]+$/.test(folderName)) {
            throw new Error('仓库名称包含无效字符');
        }
        
        if (folderName.length > 100) {
            throw new Error('仓库名称过长（最大100字符）');
        }
    }

    /**
     * 创建GitHub仓库
     * @param {String} repoName - 仓库名称
     * @param {Object} options - 可选配置
     * @returns {Promise<Object>} 仓库信息
     */
    async createRepository(repoName, options = {}) {
        console.log(`📝 创建GitHub仓库: ${repoName}`);
        
        const repoConfig = {
            name: repoName,
            description: options.description || `自动创建的仓库，来源于ZIP文件: ${repoName}`,
            private: options.private || false,
            auto_init: true,
            gitignore_template: options.gitignoreTemplate || null,
            license_template: options.licenseTemplate || null,
            allow_squash_merge: true,
            allow_merge_commit: true,
            allow_rebase_merge: true,
            delete_branch_on_merge: true
        };
        
        return await this.makeGitHubApiCall('POST', '/user/repos', repoConfig);
    }

    /**
     * 等待仓库准备就绪
     * @param {String} owner - 仓库所有者
     * @param {String} repoName - 仓库名称
     * @returns {Promise<void>}
     */
    async waitForRepositoryReady(owner, repoName, maxWaitTime = 30000) {
        console.log(`⏳ 等待仓库初始化完成...`);
        
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitTime) {
            try {
                await this.makeGitHubApiCall('GET', `/repos/${owner}/${repoName}`);
                console.log(`✅ 仓库已准备就绪`);
                return;
            } catch (error) {
                if (error.status === 404) {
                    // 仓库还未完全创建，继续等待
                    await this.delay(1000);
                    continue;
                }
                throw error;
            }
        }
        
        throw new Error('等待仓库初始化超时');
    }

    /**
     * 批量上传文件到仓库
     * @param {String} owner - 仓库所有者
     * @param {String} repoName - 仓库名称
     * @param {Array} files - 文件列表
     * @param {Object} options - 可选配置
     * @returns {Promise<Object>} 上传结果
     */
    async uploadFilesToRepository(owner, repoName, files, options = {}) {
        console.log(`📤 开始批量上传 ${files.length} 个文件...`);
        
        const results = {
            successCount: 0,
            failedCount: 0,
            skippedCount: 0,
            details: [],
            totalSize: 0
        };
        
        // 过滤和排序文件
        const filteredFiles = this.filterAndSortFiles(files, options);
        
        // 分批处理文件
        const batches = this.createBatches(filteredFiles, this.batchSize);
        
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            console.log(`📦 处理批次 ${i + 1}/${batches.length} (${batch.length} 个文件)`);
            
            await this.processBatch(owner, repoName, batch, results, options);
            
            // 批次间延迟，避免API速率限制
            if (i < batches.length - 1) {
                await this.delay(this.rateLimitDelay);
            }
        }
        
        console.log(`📊 上传完成: 成功 ${results.successCount}, 失败 ${results.failedCount}, 跳过 ${results.skippedCount}`);
        return results;
    }

    /**
     * 处理文件批次
     * @param {String} owner - 仓库所有者
     * @param {String} repoName - 仓库名称
     * @param {Array} batch - 文件批次
     * @param {Object} results - 结果对象
     * @param {Object} options - 可选配置
     */
    async processBatch(owner, repoName, batch, results, options) {
        const promises = batch.map(file => 
            this.uploadSingleFileWithRetry(owner, repoName, file, options)
                .then(result => ({ file, result, success: true }))
                .catch(error => ({ file, error, success: false }))
        );
        
        const batchResults = await Promise.all(promises);
        
        batchResults.forEach(({ file, result, error, success }) => {
            if (success) {
                results.successCount++;
                results.totalSize += file.size || 0;
                results.details.push({
                    path: file.path,
                    status: 'success',
                    size: file.size
                });
                console.log(`  ✅ ${file.path}`);
            } else {
                results.failedCount++;
                results.details.push({
                    path: file.path,
                    status: 'failed',
                    error: error.message
                });
                console.error(`  ❌ ${file.path}: ${error.message}`);
            }
        });
    }

    /**
     * 带重试机制的单文件上传
     * @param {String} owner - 仓库所有者
     * @param {String} repoName - 仓库名称
     * @param {Object} file - 文件对象
     * @param {Object} options - 可选配置
     * @returns {Promise<Object>} 上传结果
     */
    async uploadSingleFileWithRetry(owner, repoName, file, options = {}) {
        let lastError;
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                return await this.uploadSingleFile(owner, repoName, file, options);
            } catch (error) {
                lastError = error;
                
                if (attempt < this.maxRetries) {
                    const delay = this.retryDelay * Math.pow(2, attempt - 1); // 指数退避
                    console.log(`⚠️  重试 ${attempt}/${this.maxRetries} - ${file.path} (${delay}ms后重试)`);
                    await this.delay(delay);
                } else {
                    console.error(`🚫 放弃重试 - ${file.path}: ${error.message}`);
                }
            }
        }
        
        throw lastError;
    }

    /**
     * 上传单个文件
     * @param {String} owner - 仓库所有者
     * @param {String} repoName - 仓库名称
     * @param {Object} file - 文件对象
     * @param {Object} options - 可选配置
     * @returns {Promise<Object>} 上传结果
     */
    async uploadSingleFile(owner, repoName, file, options = {}) {
        // 速率限制控制
        await this.enforceRateLimit();
        
        const commitMessage = options.commitMessage || `Add ${file.name}`;
        const branch = options.branch || 'main';
        
        const fileData = {
            message: commitMessage,
            content: file.content,
            branch: branch
        };
        
        // 检查文件是否已存在
        if (options.checkExisting !== false) {
            try {
                const existingFile = await this.makeGitHubApiCall(
                    'GET', 
                    `/repos/${owner}/${repoName}/contents/${file.path}`
                );
                
                if (existingFile.sha) {
                    fileData.sha = existingFile.sha;
                    console.log(`🔄 更新现有文件: ${file.path}`);
                }
            } catch (error) {
                if (error.status !== 404) {
                    throw error;
                }
                // 文件不存在，继续创建新文件
            }
        }
        
        return await this.makeGitHubApiCall(
            'PUT',
            `/repos/${owner}/${repoName}/contents/${file.path}`,
            fileData
        );
    }

    /**
     * 创建README文件
     * @param {String} owner - 仓库所有者
     * @param {String} repoName - 仓库名称
     * @param {Array} files - 文件列表
     * @returns {Promise<Object>} 创建结果
     */
    async createReadmeFile(owner, repoName, files) {
        console.log(`📄 创建README文件...`);
        
        const readme = this.generateReadmeContent(repoName, files);
        const readmeContent = Buffer.from(readme).toString('base64');
        
        const readmeFile = {
            path: 'README.md',
            name: 'README.md',
            content: readmeContent,
            size: readme.length
        };
        
        return await this.uploadSingleFile(owner, repoName, readmeFile, {
            commitMessage: 'Add README.md',
            checkExisting: true
        });
    }

    /**
     * 生成README内容
     * @param {String} repoName - 仓库名称
     * @param {Array} files - 文件列表
     * @returns {String} README内容
     */
    generateReadmeContent(repoName, files) {
        const stats = this.calculateFileStatistics(files);
        const timestamp = new Date().toISOString();
        
        return `# ${repoName}

> 此仓库由n8n自动化工作流自动创建

## 📊 仓库统计

- **文件总数**: ${stats.totalFiles}
- **总大小**: ${this.formatFileSize(stats.totalSize)}
- **创建时间**: ${timestamp}
- **文件类型**: ${Object.keys(stats.fileTypes).length} 种

## 📁 文件类型分布

${Object.entries(stats.fileTypes)
    .sort(([,a], [,b]) => b - a)
    .map(([type, count]) => `- **${type}**: ${count} 个文件`)
    .join('\n')}

## 📂 目录结构

\`\`\`
${this.generateDirectoryTree(files)}
\`\`\`

## 🔧 生成信息

- **工作流**: n8n ZIP to GitHub
- **处理器**: AI Agent v1.0.0
- **源文件**: ${repoName}.zip

---

*此文件由自动化工具生成，请谨慎修改*
`;
    }

    /**
     * 计算文件统计信息
     * @param {Array} files - 文件列表
     * @returns {Object} 统计信息
     */
    calculateFileStatistics(files) {
        const stats = {
            totalFiles: files.length,
            totalSize: 0,
            fileTypes: {},
            directories: new Set()
        };
        
        files.forEach(file => {
            stats.totalSize += file.size || 0;
            
            const extension = file.name.substring(file.name.lastIndexOf('.') + 1).toLowerCase();
            stats.fileTypes[extension] = (stats.fileTypes[extension] || 0) + 1;
            
            if (file.directory) {
                stats.directories.add(file.directory);
            }
        });
        
        return stats;
    }

    /**
     * 生成目录树
     * @param {Array} files - 文件列表
     * @returns {String} 目录树字符串
     */
    generateDirectoryTree(files) {
        const tree = {};
        
        files.forEach(file => {
            const parts = file.path.split('/');
            let current = tree;
            
            parts.forEach((part, index) => {
                if (!current[part]) {
                    current[part] = index === parts.length - 1 ? null : {};
                }
                if (current[part]) {
                    current = current[part];
                }
            });
        });
        
        return this.renderTree(tree, '', true);
    }

    /**
     * 渲染目录树
     * @param {Object} tree - 目录树对象
     * @param {String} prefix - 前缀
     * @param {Boolean} isLast - 是否最后一个
     * @returns {String} 渲染结果
     */
    renderTree(tree, prefix = '', isLast = true) {
        let result = '';
        const entries = Object.entries(tree);
        
        entries.forEach(([name, children], index) => {
            const isLastEntry = index === entries.length - 1;
            const currentPrefix = prefix + (isLast ? '└── ' : '├── ');
            const nextPrefix = prefix + (isLast ? '    ' : '│   ');
            
            result += currentPrefix + name + '\n';
            
            if (children && typeof children === 'object') {
                result += this.renderTree(children, nextPrefix, isLastEntry);
            }
        });
        
        return result;
    }

    /**
     * 过滤和排序文件
     * @param {Array} files - 原始文件列表
     * @param {Object} options - 过滤选项
     * @returns {Array} 过滤后的文件列表
     */
    filterAndSortFiles(files, options = {}) {
        let filtered = files;
        
        // 大小过滤
        if (options.maxFileSize) {
            filtered = filtered.filter(file => 
                (file.size || 0) <= options.maxFileSize
            );
        }
        
        // 文件类型过滤
        if (options.allowedExtensions) {
            filtered = filtered.filter(file => {
                const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
                return options.allowedExtensions.includes(ext);
            });
        }
        
        // 排序：先按目录，再按文件名
        filtered.sort((a, b) => {
            if (a.directory !== b.directory) {
                return a.directory.localeCompare(b.directory);
            }
            return a.name.localeCompare(b.name);
        });
        
        return filtered;
    }

    /**
     * 创建文件批次
     * @param {Array} files - 文件列表
     * @param {Number} batchSize - 批次大小
     * @returns {Array} 批次数组
     */
    createBatches(files, batchSize) {
        const batches = [];
        for (let i = 0; i < files.length; i += batchSize) {
            batches.push(files.slice(i, i + batchSize));
        }
        return batches;
    }

    /**
     * 执行GitHub API调用
     * @param {String} method - HTTP方法
     * @param {String} endpoint - API端点
     * @param {Object} data - 请求数据
     * @returns {Promise<Object>} API响应
     */
    async makeGitHubApiCall(method, endpoint, data = null) {
        await this.enforceRateLimit();
        
        const url = `https://api.github.com${endpoint}`;
        const options = {
            method: method,
            headers: {
                'Authorization': `Bearer ${this.githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'n8n-github-agent/1.0.0'
            }
        };
        
        if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            options.body = JSON.stringify(data);
        }
        
        const response = await fetch(url, options);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const error = new Error(
                errorData.message || 
                `GitHub API调用失败: ${response.status} ${response.statusText}`
            );
            error.status = response.status;
            error.response = errorData;
            throw error;
        }
        
        return await response.json();
    }

    /**
     * 强制执行API速率限制
     */
    async enforceRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.rateLimitDelay) {
            await this.delay(this.rateLimitDelay - timeSinceLastRequest);
        }
        
        this.lastRequestTime = Date.now();
    }

    /**
     * 延迟函数
     * @param {Number} ms - 延迟毫秒数
     * @returns {Promise<void>}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 格式化文件大小
     * @param {Number} bytes - 字节数
     * @returns {String} 格式化后的大小
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// 导出代理类
module.exports = GitHubAgent;

// n8n代码节点使用示例
if (typeof $input !== 'undefined') {
    (async function() {
        try {
            // 从前一个节点获取数据
            const folderData = $node["解压缩文件"].json;
            const folderName = folderData.folderName;
            const extractedFiles = folderData.extractedFiles;
            
            // GitHub配置
            const githubConfig = {
                githubToken: process.env.GITHUB_TOKEN,
                owner: process.env.GITHUB_OWNER,
                mcpServerUrl: process.env.MCP_SERVER_URL,
                maxRetries: 3,
                retryDelay: 1000,
                batchSize: 5,
                rateLimitDelay: 200
            };
            
            // 创建AI Agent实例
            const agent = new GitHubAgent(githubConfig);
            
            // 执行创建仓库和上传文件
            const result = await agent.createRepositoryAndUploadFiles(
                folderName,
                extractedFiles,
                {
                    private: false,
                    createReadme: true,
                    description: `由n8n自动创建的仓库: ${folderName}`,
                    commitMessage: 'Initial commit from n8n automation'
                }
            );
            
            return result;
            
        } catch (error) {
            console.error('GitHub集成失败:', error);
            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    })();
}