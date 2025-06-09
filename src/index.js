/**
 * n8n ZIP to GitHub 工作流主入口文件
 * 
 * 这个文件提供了一个统一的接口来使用ZIP处理器和GitHub Agent
 * 可以用于独立测试或集成到其他项目中
 * 
 * @author n8n-automation
 * @version 1.0.0
 */

const ZipProcessor = require('./unzip-code');
const GitHubAgent = require('./github-agent');
const path = require('path');
const fs = require('fs').promises;

/**
 * 主工作流控制器类
 */
class WorkflowController {
    constructor(config = {}) {
        this.config = {
            // ZIP处理配置
            maxFileSize: config.maxFileSize || 100 * 1024 * 1024, // 100MB
            allowedExtensions: config.allowedExtensions || ['.zip'],
            
            // GitHub配置
            githubToken: config.githubToken || process.env.GITHUB_TOKEN,
            githubOwner: config.githubOwner || process.env.GITHUB_OWNER,
            
            // 通用配置
            batchSize: config.batchSize || 10,
            maxRetries: config.maxRetries || 3,
            rateLimitDelay: config.rateLimitDelay || 200,
            
            // 调试模式
            debug: config.debug || false
        };
        
        // 初始化处理器
        this.zipProcessor = new ZipProcessor({
            maxFileSize: this.config.maxFileSize,
            allowedExtensions: this.config.allowedExtensions,
            encoding: 'base64'
        });
        
        this.githubAgent = new GitHubAgent({
            githubToken: this.config.githubToken,
            owner: this.config.githubOwner,
            maxRetries: this.config.maxRetries,
            batchSize: this.config.batchSize,
            rateLimitDelay: this.config.rateLimitDelay
        });
    }

    /**
     * 完整的工作流处理
     * @param {String|Buffer} zipInput - ZIP文件路径或Buffer数据
     * @param {Object} options - 处理选项
     * @returns {Promise<Object>} 处理结果
     */
    async processWorkflow(zipInput, options = {}) {
        const startTime = Date.now();
        
        try {
            this.log('🚀 开始工作流处理...');
            
            // 步骤1: 处理输入并读取ZIP文件
            const { zipData, fileName } = await this.prepareZipData(zipInput);
            this.log(`📁 处理ZIP文件: ${fileName}`);
            
            // 步骤2: 解压缩ZIP文件
            this.log('📦 开始解压缩...');
            const extractResult = await this.zipProcessor.processZipFile(zipData, fileName);
            
            if (!extractResult.success) {
                throw new Error(`ZIP解压缩失败: ${extractResult.error}`);
            }
            
            this.log(`✅ 解压缩完成: ${extractResult.fileCount} 个文件`);
            
            // 步骤3: 创建GitHub仓库并上传文件
            this.log('🐙 创建GitHub仓库...');
            const githubResult = await this.githubAgent.createRepositoryAndUploadFiles(
                extractResult.folderName,
                extractResult.extractedFiles,
                {
                    private: options.private || false,
                    createReadme: options.createReadme !== false,
                    description: options.description || `自动创建的仓库: ${extractResult.folderName}`,
                    ...options.githubOptions
                }
            );
            
            if (!githubResult.success) {
                throw new Error(`GitHub处理失败: ${githubResult.error}`);
            }
            
            // 步骤4: 汇总结果
            const processingTime = Date.now() - startTime;
            const result = {
                success: true,
                processingTime: processingTime,
                extractResult: extractResult,
                githubResult: githubResult,
                summary: {
                    fileName: fileName,
                    folderName: extractResult.folderName,
                    fileCount: extractResult.fileCount,
                    repositoryUrl: githubResult.repository.html_url,
                    uploadedFiles: githubResult.uploadResults.successCount,
                    failedFiles: githubResult.uploadResults.failedCount
                },
                timestamp: new Date().toISOString()
            };
            
            this.log(`🎉 工作流完成! 耗时: ${processingTime}ms`);
            this.log(`📊 结果: ${result.summary.uploadedFiles}/${result.summary.fileCount} 文件成功上传`);
            
            return result;
            
        } catch (error) {
            this.log(`❌ 工作流失败: ${error.message}`, 'error');
            
            return {
                success: false,
                error: error.message,
                processingTime: Date.now() - startTime,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * 准备ZIP数据
     * @param {String|Buffer} zipInput - ZIP文件路径或Buffer
     * @returns {Promise<Object>} ZIP数据和文件名
     */
    async prepareZipData(zipInput) {
        let zipData, fileName;
        
        if (typeof zipInput === 'string') {
            // 如果是文件路径
            this.log(`📖 读取文件: ${zipInput}`);
            zipData = await fs.readFile(zipInput);
            fileName = path.basename(zipInput);
        } else if (Buffer.isBuffer(zipInput)) {
            // 如果是Buffer数据
            zipData = zipInput;
            fileName = 'archive.zip'; // 默认文件名
        } else if (zipInput && zipInput.data && zipInput.fileName) {
            // 如果是包含数据和文件名的对象
            zipData = Buffer.isBuffer(zipInput.data) ? zipInput.data : Buffer.from(zipInput.data, 'base64');
            fileName = zipInput.fileName;
        } else {
            throw new Error('无效的ZIP输入格式');
        }
        
        // 验证文件
        const stats = { name: fileName, size: zipData.length };
        this.zipProcessor.validateFile(stats);
        
        // 如果输入是Buffer，转换为base64
        const base64Data = zipData.toString('base64');
        
        return { zipData: base64Data, fileName };
    }

    /**
     * 测试连接性
     * @returns {Promise<Object>} 测试结果
     */
    async testConnections() {
        const results = {
            github: false,
            overall: false,
            errors: []
        };
        
        try {
            // 测试GitHub连接
            this.log('🧪 测试GitHub连接...');
            await this.githubAgent.makeGitHubApiCall('GET', '/user');
            results.github = true;
            this.log('✅ GitHub连接正常');
        } catch (error) {
            results.errors.push(`GitHub连接失败: ${error.message}`);
            this.log(`❌ GitHub连接失败: ${error.message}`, 'error');
        }
        
        results.overall = results.github;
        
        return results;
    }

    /**
     * 获取配置信息
     * @returns {Object} 配置信息（敏感信息已脱敏）
     */
    getConfiguration() {
        const config = { ...this.config };
        
        // 脱敏敏感信息
        if (config.githubToken) {
            config.githubToken = config.githubToken.substring(0, 8) + '...';
        }
        
        return config;
    }

    /**
     * 日志记录
     * @param {String} message - 日志消息
     * @param {String} level - 日志级别
     */
    log(message, level = 'info') {
        if (!this.config.debug && level === 'debug') {
            return;
        }
        
        const timestamp = new Date().toISOString();
        const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
        
        console.log(`${timestamp} ${prefix} ${message}`);
    }

    /**
     * 设置调试模式
     * @param {Boolean} enabled - 是否启用调试
     */
    setDebugMode(enabled) {
        this.config.debug = enabled;
        this.log(`调试模式${enabled ? '已启用' : '已禁用'}`);
    }
}

// 命令行接口
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log(`
📋 使用方法:
`);
        console.log(`  node index.js <zip文件路径> [选项]
`);
        console.log(`示例:`);
        console.log(`  node index.js ./project.zip`);
        console.log(`  node index.js ./project.zip --private`);
        console.log(`  node index.js test-connection\n`);
        process.exit(1);
    }
    
    const command = args[0];
    
    if (command === 'test-connection') {
        // 测试连接
        const controller = new WorkflowController({ debug: true });
        controller.testConnections()
            .then(results => {
                console.log('\n🧪 连接测试结果:');
                console.log(JSON.stringify(results, null, 2));
                process.exit(results.overall ? 0 : 1);
            })
            .catch(error => {
                console.error('测试失败:', error);
                process.exit(1);
            });
    } else {
        // 处理ZIP文件
        const zipPath = command;
        const options = {
            private: args.includes('--private'),
            debug: args.includes('--debug')
        };
        
        const controller = new WorkflowController({ debug: options.debug });
        
        controller.processWorkflow(zipPath, options)
            .then(result => {
                console.log('\n📊 处理结果:');
                console.log(JSON.stringify(result.summary || result, null, 2));
                process.exit(result.success ? 0 : 1);
            })
            .catch(error => {
                console.error('处理失败:', error);
                process.exit(1);
            });
    }
}

// 导出类和工具函数
module.exports = {
    WorkflowController,
    ZipProcessor,
    GitHubAgent
};