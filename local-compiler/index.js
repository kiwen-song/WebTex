/**
 * WebTeX 本地编译客户端
 * 
 * 这个程序运行在用户的本地电脑上，负责：
 * 1. 接收来自浏览器的tex文件内容
 * 2. 调用本地安装的LaTeX（支持多种编译器）进行编译
 * 3. 将编译好的PDF返回给浏览器预览
 * 
 * 支持的编译器：
 * - pdflatex: 标准 PDF LaTeX 编译器
 * - xelatex: 支持 Unicode 和系统字体的 XeLaTeX
 * - lualatex: 支持 Lua 脚本的 LuaLaTeX
 * - latexmk: 自动化编译工具（推荐）
 *   - latexmk-pdf: latexmk -pdf (使用 pdflatex)
 *   - latexmk-xelatex: latexmk -xelatex
 *   - latexmk-lualatex: latexmk -lualatex
 * 
 * 使用方法：
 * 1. 确保本地已安装 TeX Live 或 MiKTeX
 * 2. npm install
 * 3. npm start
 */

const express = require('express');
const cors = require('cors');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 编译工作目录
const WORK_DIR = path.join(os.tmpdir(), 'webtex-compile');

// 确保工作目录存在
if (!fs.existsSync(WORK_DIR)) {
    fs.mkdirSync(WORK_DIR, { recursive: true });
}

console.log(`WebTeX 本地编译客户端`);
console.log(`工作目录: ${WORK_DIR}`);

// 支持的编译器配置
const COMPILERS = {
    'pdflatex': {
        command: 'pdflatex',
        args: ['-synctex=1', '-interaction=nonstopmode', '-file-line-error'],
        description: 'PDFLaTeX - 标准编译器'
    },
    'xelatex': {
        command: 'xelatex',
        args: ['-synctex=1', '-interaction=nonstopmode', '-file-line-error'],
        description: 'XeLaTeX - 支持Unicode和系统字体'
    },
    'lualatex': {
        command: 'lualatex',
        args: ['-synctex=1', '-interaction=nonstopmode', '-file-line-error'],
        description: 'LuaLaTeX - 支持Lua脚本'
    },
    'latexmk-pdf': {
        command: 'latexmk',
        args: ['-pdf', '-synctex=1', '-interaction=nonstopmode', '-file-line-error'],
        description: 'Latexmk (PDFLaTeX) - 自动处理交叉引用'
    },
    'latexmk-xelatex': {
        command: 'latexmk',
        args: ['-xelatex', '-synctex=1', '-interaction=nonstopmode', '-file-line-error'],
        description: 'Latexmk (XeLaTeX) - 自动处理交叉引用'
    },
    'latexmk-lualatex': {
        command: 'latexmk',
        args: ['-lualatex', '-synctex=1', '-interaction=nonstopmode', '-file-line-error'],
        description: 'Latexmk (LuaLaTeX) - 自动处理交叉引用'
    }
};

// 检测可用的编译器
async function checkAvailableCompilers() {
    const available = {};

    const checks = [
        { name: 'pdflatex', cmd: 'pdflatex --version' },
        { name: 'xelatex', cmd: 'xelatex --version' },
        { name: 'lualatex', cmd: 'lualatex --version' },
        { name: 'latexmk', cmd: 'latexmk --version' }
    ];

    for (const check of checks) {
        try {
            const version = await new Promise((resolve, reject) => {
                exec(check.cmd, (error, stdout) => {
                    if (error) reject(error);
                    else resolve(stdout.split('\n')[0]);
                });
            });
            available[check.name] = { installed: true, version };
        } catch {
            available[check.name] = { installed: false };
        }
    }

    return available;
}

// 检测LaTeX是否安装（保持向后兼容）
function checkLatexInstallation() {
    return new Promise((resolve) => {
        exec('xelatex --version', (error, stdout) => {
            if (error) {
                exec('pdflatex --version', (error2, stdout2) => {
                    if (error2) {
                        resolve({ installed: false, engine: null });
                    } else {
                        resolve({ installed: true, engine: 'pdflatex', version: stdout2.split('\n')[0] });
                    }
                });
            } else {
                resolve({ installed: true, engine: 'xelatex', version: stdout.split('\n')[0] });
            }
        });
    });
}

// 编译LaTeX
async function compileLatex(files, mainFile = 'main.tex', options = {}) {
    const projectDir = path.join(WORK_DIR, `project_${Date.now()}`);

    try {
        // 创建项目目录
        fs.mkdirSync(projectDir, { recursive: true });

        // 写入所有文件（文本文件）
        for (const [filename, content] of Object.entries(files)) {
            // 跳过二进制文件标记
            if (content === null || typeof content !== 'string') continue;

            const filePath = path.join(projectDir, filename);
            const fileDir = path.dirname(filePath);
            if (!fs.existsSync(fileDir)) {
                fs.mkdirSync(fileDir, { recursive: true });
            }
            fs.writeFileSync(filePath, content, 'utf8');
        }

        // 处理资源文件（base64 格式或文件路径）
        if (options.assets) {
            for (const [filename, assetData] of Object.entries(options.assets)) {
                const targetPath = path.join(projectDir, filename);
                const targetDir = path.dirname(targetPath);
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }

                // 检查是 base64 数据还是文件路径
                if (typeof assetData === 'string' && assetData.length > 260) {
                    // 可能是 base64 数据（路径不会这么长）
                    try {
                        const buffer = Buffer.from(assetData, 'base64');
                        fs.writeFileSync(targetPath, buffer);
                        console.log(`  写入资源文件: ${filename}`);
                    } catch (e) {
                        console.error(`  解码资源文件失败: ${filename}`, e.message);
                    }
                } else if (typeof assetData === 'string' && fs.existsSync(assetData)) {
                    // 文件路径
                    fs.copyFileSync(assetData, targetPath);
                    console.log(`  复制资源文件: ${filename}`);
                }
            }
        }

        // 确定使用的编译引擎
        const compilerKey = options.compiler || options.engine || 'xelatex';
        const compilerConfig = COMPILERS[compilerKey] || COMPILERS['xelatex'];

        const command = compilerConfig.command;
        const args = [...compilerConfig.args, mainFile];

        // 判断是否使用 latexmk（不需要手动多次编译）
        const isLatexmk = compilerKey.startsWith('latexmk');

        console.log(`\n开始编译: ${command} ${args.join(' ')}`);
        console.log(`项目目录: ${projectDir}`);
        console.log(`编译器: ${compilerConfig.description}`);
        console.log(`文本文件: ${Object.keys(files).length} 个`);
        console.log(`资源文件: ${Object.keys(options.assets || {}).length} 个`);

        // 执行编译
        const compileOnce = () => {
            return new Promise((resolve, reject) => {
                const childProcess = spawn(command, args, {
                    cwd: projectDir,
                    env: { ...process.env, max_print_line: '1000' },
                    shell: process.platform === 'win32' // Windows 需要 shell
                });

                let stdout = '';
                let stderr = '';

                childProcess.stdout.on('data', (data) => {
                    stdout += data.toString();
                });

                childProcess.stderr.on('data', (data) => {
                    stderr += data.toString();
                });

                childProcess.on('close', (code) => {
                    resolve({ code, stdout, stderr });
                });

                childProcess.on('error', (err) => {
                    reject(err);
                });

                // 设置超时（120秒，latexmk可能需要更长时间）
                const timeout = isLatexmk ? 120000 : 60000;
                setTimeout(() => {
                    childProcess.kill();
                    reject(new Error(`编译超时（${timeout / 1000}秒）`));
                }, timeout);
            });
        };

        // latexmk 会自动处理多次编译，其他编译器需要手动运行两次
        let result;
        if (isLatexmk) {
            result = await compileOnce();
        } else {
            // 编译两次以处理交叉引用
            result = await compileOnce();
            if (result.code === 0) {
                result = await compileOnce();
            }
        }

        // 检查PDF是否生成
        const pdfName = mainFile.replace('.tex', '.pdf');
        const pdfPath = path.join(projectDir, pdfName);

        if (fs.existsSync(pdfPath)) {
            const pdfBuffer = fs.readFileSync(pdfPath);
            const logPath = path.join(projectDir, mainFile.replace('.tex', '.log'));
            const logContent = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';

            // 解析警告和错误
            const warnings = parseWarnings(logContent);
            const errors = parseErrors(logContent);

            // 清理临时文件（保留一段时间用于调试）
            setTimeout(() => {
                try {
                    fs.rmSync(projectDir, { recursive: true, force: true });
                } catch (e) {
                    console.error('清理临时文件失败:', e);
                }
            }, 60000);

            return {
                success: true,
                pdf: pdfBuffer.toString('base64'),
                log: logContent,
                warnings,
                errors,
                compiler: compilerKey,
                message: errors.length > 0 ? '编译完成，但有错误' : '编译成功'
            };
        } else {
            // 读取日志文件以获取错误信息
            const logPath = path.join(projectDir, mainFile.replace('.tex', '.log'));
            const logContent = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : result.stdout;
            const errors = parseErrors(logContent);

            return {
                success: false,
                pdf: null,
                log: logContent,
                warnings: [],
                errors,
                message: '编译失败: ' + (errors[0]?.message || '未知错误')
            };
        }
    } catch (error) {
        console.error('编译过程出错:', error);
        return {
            success: false,
            pdf: null,
            log: error.message,
            warnings: [],
            errors: [{ line: 0, message: error.message }],
            message: '编译出错: ' + error.message
        };
    }
}

// 解析LaTeX日志中的错误
function parseErrors(log) {
    const errors = [];
    const lines = log.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // 匹配错误格式: filename:line: error message
        const match1 = line.match(/^(.+\.tex):(\d+):\s*(.+)/);
        if (match1) {
            errors.push({
                file: match1[1],
                line: parseInt(match1[2]),
                message: match1[3]
            });
            continue;
        }

        // 匹配 ! 开头的错误
        if (line.startsWith('!')) {
            const errorMsg = line.substring(2);
            let errorLine = 0;

            // 查找行号
            for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
                const lineMatch = lines[j].match(/l\.(\d+)/);
                if (lineMatch) {
                    errorLine = parseInt(lineMatch[1]);
                    break;
                }
            }

            errors.push({
                file: 'main.tex',
                line: errorLine,
                message: errorMsg
            });
        }
    }

    return errors;
}

// 解析LaTeX日志中的警告
function parseWarnings(log) {
    const warnings = [];
    const lines = log.split('\n');

    for (const line of lines) {
        if (line.includes('Warning:')) {
            warnings.push({
                message: line.trim()
            });
        }
    }

    return warnings.slice(0, 20); // 限制警告数量
}

// API: 健康检查
app.get('/health', async (req, res) => {
    const latex = await checkLatexInstallation();
    const availableCompilers = await checkAvailableCompilers();

    // 构建可用编译器列表
    const compilers = Object.entries(COMPILERS).map(([key, config]) => {
        const baseCompiler = config.command;
        const isAvailable = availableCompilers[baseCompiler]?.installed || false;
        return {
            id: key,
            name: config.description,
            available: isAvailable
        };
    }).filter(c => c.available);

    res.json({
        status: 'ok',
        latex,
        compilers,
        availableCompilers,
        workDir: WORK_DIR
    });
});

// API: 获取可用编译器列表
app.get('/compilers', async (req, res) => {
    const availableCompilers = await checkAvailableCompilers();

    const compilers = Object.entries(COMPILERS).map(([key, config]) => {
        const baseCompiler = config.command;
        const isAvailable = availableCompilers[baseCompiler]?.installed || false;
        return {
            id: key,
            name: config.description,
            command: config.command,
            available: isAvailable,
            version: availableCompilers[baseCompiler]?.version || null
        };
    });

    res.json({ compilers });
});

// API: 检查LaTeX安装
app.get('/check', async (req, res) => {
    const result = await checkLatexInstallation();
    res.json(result);
});

// API: 编译
app.post('/compile', async (req, res) => {
    const { files, assets, mainFile, options, compiler } = req.body;

    if (!files || Object.keys(files).length === 0) {
        return res.status(400).json({
            success: false,
            message: '没有提供文件内容'
        });
    }

    // 合并 compiler 和 assets 参数到 options
    const compileOptions = {
        ...options,
        compiler: compiler || options?.compiler || 'xelatex',
        assets: assets || options?.assets || {}
    };

    console.log(`\n收到编译请求:`);
    console.log(`- 文件数量: ${Object.keys(files).length}`);
    console.log(`- 主文件: ${mainFile || 'main.tex'}`);
    console.log(`- 编译器: ${compileOptions.compiler}`);
    console.log(`- 资源文件: ${Object.keys(compileOptions.assets).length} 个`);

    const result = await compileLatex(files, mainFile || 'main.tex', compileOptions);
    res.json(result);
});

// API: 获取PDF（用于已编译的项目）
app.get('/pdf/:projectId', (req, res) => {
    const pdfPath = path.join(WORK_DIR, req.params.projectId, 'main.pdf');
    if (fs.existsSync(pdfPath)) {
        res.sendFile(pdfPath);
    } else {
        res.status(404).json({ error: 'PDF not found' });
    }
});

// 启动服务器
const PORT = process.env.PORT || 8088;

app.listen(PORT, async () => {
    console.log(`\n========================================`);
    console.log(`  WebTeX 本地编译服务已启动`);
    console.log(`  地址: http://localhost:${PORT}`);
    console.log(`========================================\n`);

    const latex = await checkLatexInstallation();
    if (latex.installed) {
        console.log(`✓ 检测到 LaTeX: ${latex.engine}`);
        console.log(`  版本: ${latex.version}`);
    } else {
        console.log(`✗ 未检测到 LaTeX 安装`);
        console.log(`  请安装 TeX Live 或 MiKTeX`);
        console.log(`  Windows: https://miktex.org/download`);
        console.log(`  或: https://www.tug.org/texlive/`);
    }

    console.log(`\n现在可以在浏览器中使用 WebTeX 编辑器了`);
    console.log(`编辑器会自动连接到此编译服务\n`);
});
