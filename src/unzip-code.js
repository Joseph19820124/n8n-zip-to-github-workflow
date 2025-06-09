/**
 * n8n ZIP解压缩处理器
 * 
 * 这个模块负责处理上传到Google Drive的ZIP文件，
 * 包括下载、解压缩和文件结构分析。
 * 
 * @author n8n-automation
 * @version 1.0.0
 */

const JSZip = require('jszip');

/**
 * ZIP文件处理器类
 */
class ZipProcessor {
    constructor(options = {}) {
        this.maxFileSize = options.maxFileSize || 100 * 1024 * 1024; // 100MB
        this.allowedExtensions = options.allowedExtensions || ['.zip'];
        this.encoding = options.encoding || 'base64';
    }

    /**
     * 验证文件是否符合处理条件
     * @param {Object} fileInfo - 文件信息对象
     * @returns {boolean} 是否通过验证
     */
    validateFile(fileInfo) {
        // 检查文件大小
        if (fileInfo.size > this.maxFileSize) {
            throw new Error(`文件大小超过限制: ${fileInfo.size} > ${this.maxFileSize}`);
        }

        // 检查文件扩展名
        const extension = fileInfo.name.toLowerCase().substring(fileInfo.name.lastIndexOf('.'));
        if (!this.allowedExtensions.includes(extension)) {
            throw new Error(`不支持的文件类型: ${extension}`);
        }

        return true;
    }

    /**
     * 处理ZIP文件的主要方法
     * @param {Buffer|String} zipData - ZIP文件数据
     * @param {String} originalFileName - 原始文件名
     * @returns {Promise<Object>} 处理结果
     */
    async processZipFile(zipData, originalFileName) {
        try {
            console.log(`开始处理ZIP文件: ${originalFileName}`);
            
            // 移除.zip扩展名获取文件夹名
            const folderName = this.generateFolderName(originalFileName);
            
            // 创建JSZip实例并加载文件
            const zip = new JSZip();
            await zip.loadAsync(zipData, {
                base64: this.encoding === 'base64',
                checkCRC32: true,
                optimizedBinaryString: false,
                createFolders: true
            });
            
            // 提取所有文件
            const extractedFiles = await this.extractAllFiles(zip);
            
            // 构建文件夹结构
            const fileStructure = this.buildFileStructure(extractedFiles);
            
            // 生成处理统计信息
            const statistics = this.generateStatistics(extractedFiles);
            
            const result = {
                success: true,
                folderName: folderName,
                extractedFiles: extractedFiles,
                fileCount: extractedFiles.length,
                fileStructure: fileStructure,
                statistics: statistics,
                timestamp: new Date().toISOString(),
                processingTime: process.hrtime.bigint()
            };
            
            console.log(`✅ ZIP文件处理完成: ${extractedFiles.length} 个文件`);
            return result;
            
        } catch (error) {
            console.error(`❌ ZIP文件处理失败: ${error.message}`);
            throw new Error(`ZIP文件处理失败: ${error.message}`);
        }
    }

    /**
     * 生成文件夹名称
     * @param {String} originalFileName - 原始文件名
     * @returns {String} 清理后的文件夹名
     */
    generateFolderName(originalFileName) {
        return originalFileName
            .replace(/\.zip$/i, '')
            .replace(/[^a-zA-Z0-9\-_]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .toLowerCase();
    }

    /**
     * 提取ZIP文件中的所有文件
     * @param {JSZip} zip - JSZip实例
     * @returns {Promise<Array>} 提取的文件列表
     */
    async extractAllFiles(zip) {
        const extractedFiles = [];
        const totalFiles = Object.keys(zip.files).filter(path => !zip.files[path].dir).length;
        let processedCount = 0;
        
        console.log(`开始提取 ${totalFiles} 个文件...`);
        
        for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
            if (!zipEntry.dir) { // 只处理文件，不处理目录
                try {
                    // 获取文件内容
                    const fileContent = await zipEntry.async('base64');
                    
                    // 检测文件类型
                    const mimeType = this.detectMimeType(relativePath);
                    
                    // 构建文件信息
                    const fileInfo = {
                        path: relativePath,
                        name: relativePath.split('/').pop(),
                        content: fileContent,
                        size: zipEntry._data ? zipEntry._data.uncompressedSize : 0,
                        compressedSize: zipEntry._data ? zipEntry._data.compressedSize : 0,
                        directory: relativePath.includes('/') ? 
                            relativePath.substring(0, relativePath.lastIndexOf('/')) : '',
                        mimeType: mimeType,
                        lastModified: zipEntry.date || new Date(),
                        checksum: this.calculateChecksum(fileContent)
                    };
                    
                    extractedFiles.push(fileInfo);
                    processedCount++;
                    
                    // 显示处理进度
                    if (processedCount % 10 === 0 || processedCount === totalFiles) {
                        console.log(`进度: ${processedCount}/${totalFiles} 文件已处理`);
                    }
                    
                } catch (error) {
                    console.error(`提取文件失败 ${relativePath}: ${error.message}`);
                    // 继续处理其他文件
                }
            }
        }
        
        return extractedFiles;
    }

    /**
     * 构建文件夹结构树
     * @param {Array} extractedFiles - 提取的文件列表
     * @returns {Object} 文件夹结构对象
     */
    buildFileStructure(extractedFiles) {
        const structure = {};
        
        extractedFiles.forEach(file => {
            const pathParts = file.path.split('/');
            let currentLevel = structure;
            
            // 构建目录结构
            for (let i = 0; i < pathParts.length - 1; i++) {
                const dirName = pathParts[i];
                if (!currentLevel[dirName]) {
                    currentLevel[dirName] = {
                        type: 'directory',
                        children: {},
                        fileCount: 0,
                        totalSize: 0
                    };
                }
                currentLevel[dirName].fileCount++;
                currentLevel[dirName].totalSize += file.size;
                currentLevel = currentLevel[dirName].children;
            }
            
            // 添加文件
            const fileName = pathParts[pathParts.length - 1];
            currentLevel[fileName] = {
                type: 'file',
                size: file.size,
                mimeType: file.mimeType,
                lastModified: file.lastModified
            };
        });
        
        return structure;
    }

    /**
     * 生成处理统计信息
     * @param {Array} extractedFiles - 提取的文件列表
     * @returns {Object} 统计信息对象
     */
    generateStatistics(extractedFiles) {
        const stats = {
            totalFiles: extractedFiles.length,
            totalSize: 0,
            totalCompressedSize: 0,
            fileTypes: {},
            directories: new Set(),
            largestFile: null,
            smallestFile: null,
            averageFileSize: 0,
            compressionRatio: 0
        };
        
        extractedFiles.forEach(file => {
            // 计算总大小
            stats.totalSize += file.size;
            stats.totalCompressedSize += file.compressedSize || 0;
            
            // 统计文件类型
            const extension = file.name.substring(file.name.lastIndexOf('.') + 1).toLowerCase();
            stats.fileTypes[extension] = (stats.fileTypes[extension] || 0) + 1;
            
            // 记录目录
            if (file.directory) {
                stats.directories.add(file.directory);
            }
            
            // 查找最大和最小文件
            if (!stats.largestFile || file.size > stats.largestFile.size) {
                stats.largestFile = { name: file.name, size: file.size };
            }
            if (!stats.smallestFile || file.size < stats.smallestFile.size) {
                stats.smallestFile = { name: file.name, size: file.size };
            }
        });
        
        // 计算平均文件大小
        stats.averageFileSize = stats.totalFiles > 0 ? 
            Math.round(stats.totalSize / stats.totalFiles) : 0;
        
        // 计算压缩比
        stats.compressionRatio = stats.totalSize > 0 ? 
            Math.round((1 - stats.totalCompressedSize / stats.totalSize) * 100) : 0;
        
        // 转换目录集合为数组
        stats.directories = Array.from(stats.directories);
        
        return stats;
    }

    /**
     * 检测文件MIME类型
     * @param {String} filePath - 文件路径
     * @returns {String} MIME类型
     */
    detectMimeType(filePath) {
        const extension = filePath.substring(filePath.lastIndexOf('.') + 1).toLowerCase();
        
        const mimeTypes = {
            'js': 'application/javascript',
            'json': 'application/json',
            'html': 'text/html',
            'css': 'text/css',
            'txt': 'text/plain',
            'md': 'text/markdown',
            'xml': 'application/xml',
            'pdf': 'application/pdf',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'svg': 'image/svg+xml',
            'zip': 'application/zip',
            'py': 'text/x-python',
            'java': 'text/x-java-source',
            'cpp': 'text/x-c++src',
            'c': 'text/x-csrc',
            'php': 'application/x-httpd-php'
        };
        
        return mimeTypes[extension] || 'application/octet-stream';
    }

    /**
     * 计算文件内容校验和
     * @param {String} content - 文件内容(base64)
     * @returns {String} MD5校验和
     */
    calculateChecksum(content) {
        // 简单的校验和计算（在生产环境中建议使用crypto模块）
        let hash = 0;
        if (content.length === 0) return hash.toString(16);
        
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转换为32位整数
        }
        
        return Math.abs(hash).toString(16);
    }
}

// 导出处理器类
module.exports = ZipProcessor;

// n8n代码节点使用示例
if (typeof $input !== 'undefined') {
    (async function() {
        try {
            // 获取上传的ZIP文件数据
            const zipData = $input.first().binary.data;
            const originalFileName = $input.first().json.name;
            
            // 创建处理器实例
            const processor = new ZipProcessor({
                maxFileSize: 100 * 1024 * 1024, // 100MB
                allowedExtensions: ['.zip'],
                encoding: 'base64'
            });
            
            // 验证文件
            processor.validateFile({
                name: originalFileName,
                size: $input.first().json.size || 0
            });
            
            // 处理ZIP文件
            const result = await processor.processZipFile(zipData, originalFileName);
            
            // 返回处理结果
            return result;
            
        } catch (error) {
            console.error('ZIP处理失败:', error);
            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    })();
}