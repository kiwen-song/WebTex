const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const DiffMatchPatch = require('diff-match-patch');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const dmp = new DiffMatchPatch();

// 数据存储目录
const DATA_DIR = path.join(__dirname, '../data');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// 配置 multer 文件上传
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const projectId = req.params.projectId;
        const folderPath = req.body.folderPath || '';
        const projectUploadDir = path.join(UPLOADS_DIR, projectId, folderPath);
        if (!fs.existsSync(projectUploadDir)) {
            fs.mkdirSync(projectUploadDir, { recursive: true });
        }
        cb(null, projectUploadDir);
    },
    filename: (req, file, cb) => {
        // 保持原始文件名，支持中文
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        cb(null, originalName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB 限制
});

// 静态文件服务
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json({ limit: '50mb' }));

// 为上传的文件提供静态服务
app.use('/uploads', express.static(UPLOADS_DIR));

// ===== 项目数据持久化 =====
function loadProjectsFromDisk() {
    try {
        if (fs.existsSync(PROJECTS_FILE)) {
            const data = fs.readFileSync(PROJECTS_FILE, 'utf8');
            const projectsData = JSON.parse(data);
            return new Map(Object.entries(projectsData));
        }
    } catch (error) {
        console.error('加载项目数据失败:', error);
    }
    return new Map();
}

function saveProjectsToDisk() {
    try {
        const projectsData = {};
        projects.forEach((project, id) => {
            // 只保存项目数据，不保存运行时的用户和光标信息
            projectsData[id] = {
                id: project.id,
                name: project.name,
                files: project.files,
                folders: project.folders || [],
                compiler: project.compiler || 'xelatex',
                mainFile: project.mainFile || 'main.tex',
                created: project.created,
                updated: Date.now()
            };
        });
        fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projectsData, null, 2), 'utf8');
    } catch (error) {
        console.error('保存项目数据失败:', error);
    }
}

// 定期保存项目数据（每30秒）
setInterval(saveProjectsToDisk, 30000);

// 存储项目和文档数据
const projects = loadProjectsFromDisk();
const users = new Map();

// 创建默认项目
function createDefaultProject() {
    return {
        id: uuidv4(),
        name: '数学建模论文',
        files: {
            'main.tex': {
                content: `\\documentclass[12pt,a4paper]{article}
\\usepackage[UTF8]{ctex}
\\usepackage{amsmath,amssymb,amsthm}
\\usepackage{graphicx}
\\usepackage{geometry}
\\usepackage{fancyhdr}
\\usepackage{lastpage}
\\usepackage{listings}
\\usepackage{xcolor}
\\usepackage{booktabs}
\\usepackage{float}
\\usepackage{subfigure}
\\usepackage{hyperref}

\\geometry{left=2.5cm,right=2.5cm,top=2.5cm,bottom=2.5cm}

\\title{数学建模论文标题}
\\author{队伍编号}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
这里是摘要内容。请在这里简要描述你的研究问题、方法和主要结论。

\\textbf{关键词：} 关键词1；关键词2；关键词3
\\end{abstract}

\\tableofcontents
\\newpage

\\section{问题重述}
在这里重述比赛题目中的问题...

\\section{问题分析}
对问题进行深入分析...

\\section{模型假设}
\\begin{enumerate}
  \\item 假设1...
  \\item 假设2...
  \\item 假设3...
\\end{enumerate}

\\section{符号说明}
\\begin{table}[H]
\\centering
\\begin{tabular}{cl}
\\toprule
符号 & 说明 \\\\
\\midrule
$x$ & 变量x的说明 \\\\
$y$ & 变量y的说明 \\\\
\\bottomrule
\\end{tabular}
\\caption{符号说明表}
\\end{table}

\\section{模型建立}

\\subsection{模型一}
这里是模型一的内容...

数学公式示例：
\\begin{equation}
E = mc^2
\\end{equation}

\\subsection{模型二}
这里是模型二的内容...

\\section{模型求解}
求解过程...

\\section{结果分析}
结果分析...

\\section{模型评价与改进}

\\subsection{模型优点}
\\begin{itemize}
  \\item 优点1
  \\item 优点2
\\end{itemize}

\\subsection{模型缺点}
\\begin{itemize}
  \\item 缺点1
  \\item 缺点2
\\end{itemize}

\\subsection{改进方向}
改进方向...

\\section{参考文献}
\\begin{thebibliography}{99}
\\bibitem{ref1} 作者. 文献标题[J]. 期刊名, 年份, 卷(期): 页码.
\\end{thebibliography}

\\appendix
\\section{附录}
这里放置代码或补充材料...

\\end{document}
`,
                version: 1,
                lastModified: Date.now()
            }
        },
        folders: [],
        compiler: 'xelatex',
        mainFile: 'main.tex',
        users: new Map(),
        cursors: new Map(),
        created: Date.now()
    };
}

// 只有在没有任何项目时才创建默认项目
if (projects.size === 0) {
    const defaultProject = createDefaultProject();
    projects.set(defaultProject.id, defaultProject);
    saveProjectsToDisk();
}

// ===== HTTP API 路由 =====

// 获取所有项目列表
app.get('/api/projects', (req, res) => {
    const projectList = Array.from(projects.values()).map(p => ({
        id: p.id,
        name: p.name,
        fileCount: Object.keys(p.files).length,
        userCount: p.users ? p.users.size : 0,
        compiler: p.compiler || 'xelatex',
        mainFile: p.mainFile || 'main.tex',
        created: p.created,
        updated: p.updated || p.created
    }));
    res.json(projectList);
});

// 创建新项目
app.post('/api/projects', (req, res) => {
    const { name, template } = req.body;
    const project = createDefaultProject();
    project.name = name || '新项目';

    // 如果指定了模板，可以使用不同的初始内容
    if (template === 'empty') {
        project.files = {
            'main.tex': {
                content: `\\documentclass[12pt,a4paper]{article}
\\usepackage[UTF8]{ctex}

\\begin{document}

\\end{document}
`,
                version: 1,
                lastModified: Date.now()
            }
        };
    }

    projects.set(project.id, project);
    saveProjectsToDisk();

    res.json({
        success: true,
        project: {
            id: project.id,
            name: project.name
        }
    });
});

// 获取单个项目详情
app.get('/api/projects/:projectId', (req, res) => {
    const project = projects.get(req.params.projectId);
    if (!project) {
        return res.status(404).json({ error: '项目不存在' });
    }

    res.json({
        id: project.id,
        name: project.name,
        files: Object.keys(project.files),
        folders: project.folders || [],
        compiler: project.compiler || 'xelatex',
        mainFile: project.mainFile || 'main.tex',
        created: project.created
    });
});

// 更新项目设置
app.put('/api/projects/:projectId', (req, res) => {
    const project = projects.get(req.params.projectId);
    if (!project) {
        return res.status(404).json({ error: '项目不存在' });
    }

    const { name, compiler, mainFile } = req.body;
    if (name) project.name = name;
    if (compiler) project.compiler = compiler;
    if (mainFile) project.mainFile = mainFile;

    saveProjectsToDisk();

    // 通知所有在该项目中的用户
    io.to(req.params.projectId).emit('project-updated', {
        name: project.name,
        compiler: project.compiler,
        mainFile: project.mainFile
    });

    res.json({ success: true });
});

// 删除项目
app.delete('/api/projects/:projectId', (req, res) => {
    const projectId = req.params.projectId;

    if (!projects.has(projectId)) {
        return res.status(404).json({ error: '项目不存在' });
    }

    // 删除项目上传的文件
    const projectUploadDir = path.join(UPLOADS_DIR, projectId);
    if (fs.existsSync(projectUploadDir)) {
        fs.rmSync(projectUploadDir, { recursive: true, force: true });
    }

    projects.delete(projectId);
    saveProjectsToDisk();

    res.json({ success: true });
});

// 上传文件到项目
app.post('/api/projects/:projectId/upload', upload.array('files', 50), (req, res) => {
    const projectId = req.params.projectId;
    const project = projects.get(projectId);

    if (!project) {
        return res.status(404).json({ error: '项目不存在' });
    }

    const folderPath = req.body.folderPath || '';
    const uploadedFiles = [];

    req.files.forEach(file => {
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const relativePath = folderPath ? `${folderPath}/${originalName}` : originalName;

        // 判断是否是文本文件
        const textExtensions = ['.tex', '.bib', '.sty', '.cls', '.txt', '.md', '.json', '.xml', '.csv'];
        const isTextFile = textExtensions.some(ext => originalName.toLowerCase().endsWith(ext));

        if (isTextFile) {
            // 文本文件存入内存
            const content = fs.readFileSync(file.path, 'utf8');
            project.files[relativePath] = {
                content,
                version: 1,
                lastModified: Date.now()
            };
        } else {
            // 二进制文件（图片等）只记录路径
            project.files[relativePath] = {
                content: null,
                isAsset: true,
                assetPath: `/uploads/${projectId}/${relativePath}`,
                version: 1,
                lastModified: Date.now()
            };
        }

        uploadedFiles.push({
            name: originalName,
            path: relativePath,
            isAsset: !isTextFile
        });
    });

    saveProjectsToDisk();

    // 通知所有在项目中的用户有新文件
    io.to(projectId).emit('files-uploaded', { files: uploadedFiles });

    res.json({
        success: true,
        files: uploadedFiles
    });
});

// 创建文件夹
app.post('/api/projects/:projectId/folders', (req, res) => {
    const projectId = req.params.projectId;
    const project = projects.get(projectId);

    if (!project) {
        return res.status(404).json({ error: '项目不存在' });
    }

    const { folderPath } = req.body;
    if (!folderPath) {
        return res.status(400).json({ error: '请提供文件夹路径' });
    }

    // 确保 folders 数组存在
    if (!project.folders) {
        project.folders = [];
    }

    if (!project.folders.includes(folderPath)) {
        project.folders.push(folderPath);

        // 在磁盘上创建文件夹
        const folderFullPath = path.join(UPLOADS_DIR, projectId, folderPath);
        if (!fs.existsSync(folderFullPath)) {
            fs.mkdirSync(folderFullPath, { recursive: true });
        }

        saveProjectsToDisk();

        // 通知所有在项目中的用户
        io.to(projectId).emit('folder-created', { folderPath });
    }

    res.json({ success: true });
});

// 导入ZIP项目
app.post('/api/projects/:projectId/import-zip', upload.single('zipFile'), async (req, res) => {
    const projectId = req.params.projectId;
    const project = projects.get(projectId);

    if (!project) {
        return res.status(404).json({ error: '项目不存在' });
    }

    if (!req.file) {
        return res.status(400).json({ error: '请上传ZIP文件' });
    }

    try {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(req.file.path);
        const zipEntries = zip.getEntries();

        const importedFiles = [];
        const texFiles = []; // 记录所有导入的 .tex 文件

        // 扩展文本文件类型列表
        const textExtensions = [
            '.tex', '.bib', '.sty', '.cls', '.txt', '.md', '.json', '.xml', '.csv',
            '.m', '.py', '.r', '.jl', '.js', '.ts', '.c', '.cpp', '.h', '.hpp',
            '.java', '.rb', '.sh', '.bat', '.yaml', '.yml', '.toml', '.ini', '.cfg',
            '.html', '.css', '.scss', '.less', '.sql', '.awk', '.sed', '.pl', '.lua'
        ];

        zipEntries.forEach(entry => {
            if (entry.isDirectory) {
                const folderPath = entry.entryName.replace(/\/$/, '');
                if (folderPath && !project.folders.includes(folderPath)) {
                    project.folders.push(folderPath);
                }
            } else {
                const fileName = entry.entryName;
                const lowerFileName = fileName.toLowerCase();
                const isTextFile = textExtensions.some(ext => lowerFileName.endsWith(ext));

                if (isTextFile) {
                    // 文本文件存入内存
                    const content = entry.getData().toString('utf8');
                    project.files[fileName] = {
                        content,
                        version: 1,
                        lastModified: Date.now()
                    };

                    // 记录 .tex 文件
                    if (lowerFileName.endsWith('.tex')) {
                        texFiles.push({ name: fileName, content });
                    }
                } else {
                    // 二进制文件保存到磁盘
                    const targetPath = path.join(UPLOADS_DIR, projectId, fileName);
                    const targetDir = path.dirname(targetPath);
                    if (!fs.existsSync(targetDir)) {
                        fs.mkdirSync(targetDir, { recursive: true });
                    }
                    fs.writeFileSync(targetPath, entry.getData());

                    project.files[fileName] = {
                        content: null,
                        isAsset: true,
                        assetPath: `/uploads/${projectId}/${fileName}`,
                        version: 1,
                        lastModified: Date.now()
                    };
                }

                importedFiles.push({
                    name: fileName,
                    isAsset: !isTextFile
                });
            }
        });

        // 自动检测主 .tex 文件
        if (texFiles.length > 0) {
            let mainTexFile = null;

            // 优先级1: 查找包含 \documentclass 的文件
            for (const tex of texFiles) {
                if (tex.content.includes('\\documentclass')) {
                    mainTexFile = tex.name;
                    break;
                }
            }

            // 优先级2: 查找名为 main.tex 的导入文件
            if (!mainTexFile) {
                const mainTex = texFiles.find(f => f.name.toLowerCase() === 'main.tex');
                if (mainTex) mainTexFile = mainTex.name;
            }

            // 优先级3: 使用第一个 .tex 文件
            if (!mainTexFile) {
                mainTexFile = texFiles[0].name;
            }

            // 设置主文件
            if (mainTexFile) {
                // 如果导入的主文件不是 main.tex，且原来有空的 main.tex，则删除它
                if (mainTexFile !== 'main.tex' && project.files['main.tex']) {
                    const oldMainContent = project.files['main.tex'].content || '';
                    // 如果原来的 main.tex 是默认模板（很短），就删除它
                    if (oldMainContent.length < 200 || oldMainContent.includes('% 这是一个基本的 LaTeX 文档')) {
                        delete project.files['main.tex'];
                    }
                }
                project.mainFile = mainTexFile;
            }
        }

        // 删除上传的临时ZIP文件
        fs.unlinkSync(req.file.path);

        saveProjectsToDisk();

        // 通知所有在项目中的用户
        io.to(projectId).emit('project-imported', {
            files: importedFiles,
            mainFile: project.mainFile
        });

        res.json({
            success: true,
            filesCount: importedFiles.length,
            files: importedFiles,
            mainFile: project.mainFile
        });
    } catch (error) {
        console.error('导入ZIP失败:', error);
        res.status(500).json({ error: '导入失败: ' + error.message });
    }
});

// 获取项目文件内容
app.get('/api/projects/:projectId/files/:filePath(*)', (req, res) => {
    const projectId = req.params.projectId;
    const filePath = req.params.filePath;
    const project = projects.get(projectId);

    if (!project) {
        return res.status(404).json({ error: '项目不存在' });
    }

    const file = project.files[filePath];
    if (!file) {
        return res.status(404).json({ error: '文件不存在' });
    }

    if (file.isAsset) {
        // 返回资源文件的URL
        res.json({
            isAsset: true,
            assetPath: file.assetPath
        });
    } else {
        res.json({
            content: file.content,
            version: file.version
        });
    }
});

// 编译项目 - 代理到本地编译服务
app.post('/api/projects/:projectId/compile', async (req, res) => {
    const projectId = req.params.projectId;
    const project = projects.get(projectId);
    const { compilerUrl, compiler } = req.body;

    if (!project) {
        return res.status(404).json({ error: '项目不存在' });
    }

    try {
        // 收集所有文本文件
        const files = {};
        const assets = {};

        console.log(`\n编译项目 ${projectId}:`);
        console.log(`文件列表:`, Object.keys(project.files));

        for (const [filename, file] of Object.entries(project.files)) {
            if (file.isAsset) {
                // 资源文件：读取实际文件并转为 base64
                const assetPath = path.join(UPLOADS_DIR, projectId, filename);
                console.log(`  检查资源文件: ${filename} -> ${assetPath}`);
                if (fs.existsSync(assetPath)) {
                    const fileData = fs.readFileSync(assetPath);
                    assets[filename] = fileData.toString('base64');
                    console.log(`    ✓ 已读取 (${fileData.length} bytes)`);
                } else {
                    console.log(`    ✗ 文件不存在`);
                }
            } else if (file.content !== null) {
                // 文本文件
                files[filename] = file.content;
            }
        }

        console.log(`文本文件: ${Object.keys(files).length} 个`);
        console.log(`资源文件: ${Object.keys(assets).length} 个`);

        // 发送到本地编译服务
        const targetUrl = compilerUrl || 'http://localhost:8088';
        const fetch = (await import('node-fetch')).default;

        const compileResponse = await fetch(`${targetUrl}/compile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                files,
                assets,
                mainFile: project.mainFile || 'main.tex',
                compiler: compiler || project.compiler || 'xelatex'
            })
        });

        const result = await compileResponse.json();
        res.json(result);

    } catch (error) {
        console.error('编译请求失败:', error);
        res.status(500).json({
            success: false,
            error: '编译服务连接失败: ' + error.message
        });
    }
});

// Socket.io 连接处理
io.on('connection', (socket) => {
    console.log(`用户连接: ${socket.id}`);

    let currentUser = null;
    let currentProjectId = null;
    let currentFile = null;

    // 用户加入项目
    socket.on('join-project', ({ projectId, username, color }) => {
        // 如果没有指定项目ID，使用第一个项目或创建新项目
        if (!projectId) {
            const firstProject = projects.values().next().value;
            projectId = firstProject ? firstProject.id : null;
        }

        let project = projects.get(projectId);
        if (!project) {
            // 如果项目不存在，创建新项目
            project = createDefaultProject();
            project.id = projectId || project.id;
            projects.set(project.id, project);
            projectId = project.id;
            saveProjectsToDisk();
        }

        // 确保 users 和 cursors 是 Map
        if (!project.users || !(project.users instanceof Map)) {
            project.users = new Map();
        }
        if (!project.cursors || !(project.cursors instanceof Map)) {
            project.cursors = new Map();
        }

        currentProjectId = projectId;
        currentUser = {
            id: socket.id,
            username: username || `用户${Math.floor(Math.random() * 1000)}`,
            color: color || getRandomColor(),
            currentFile: project.mainFile || 'main.tex'
        };
        currentFile = project.mainFile || 'main.tex';

        project.users.set(socket.id, currentUser);
        users.set(socket.id, { projectId, user: currentUser });

        socket.join(projectId);

        // 发送项目数据给用户
        socket.emit('project-data', {
            projectId: project.id,
            projectName: project.name,
            compiler: project.compiler || 'xelatex',
            mainFile: project.mainFile || 'main.tex',
            folders: project.folders || [],
            files: Object.fromEntries(
                Object.entries(project.files).map(([name, file]) => [
                    name,
                    {
                        content: file.content,
                        version: file.version,
                        isAsset: file.isAsset || false,
                        assetPath: file.assetPath || null
                    }
                ])
            ),
            users: Array.from(project.users.values()),
            cursors: Array.from(project.cursors.entries())
        });

        // 通知其他用户有新用户加入
        socket.to(projectId).emit('user-joined', currentUser);

        console.log(`${currentUser.username} 加入项目 ${projectId}`);
    });

    // 处理文档更改
    socket.on('doc-change', ({ file, changes, version }) => {
        if (!currentProjectId || !currentUser) return;

        const project = projects.get(currentProjectId);
        if (!project || !project.files[file]) return;

        const fileData = project.files[file];

        // 应用更改
        try {
            // 使用 diff-match-patch 进行操作转换
            let content = fileData.content;

            for (const change of changes) {
                if (change.origin === '+input' || change.origin === '+delete' || change.origin === 'paste' || change.origin === 'cut') {
                    const { from, to, text } = change;
                    const lines = content.split('\n');

                    // 计算位置
                    let startPos = 0;
                    for (let i = 0; i < from.line; i++) {
                        startPos += (lines[i] || '').length + 1;
                    }
                    startPos += from.ch;

                    let endPos = 0;
                    for (let i = 0; i < to.line; i++) {
                        endPos += (lines[i] || '').length + 1;
                    }
                    endPos += to.ch;

                    // 应用更改
                    content = content.substring(0, startPos) + text.join('\n') + content.substring(endPos);
                }
            }

            fileData.content = content;
            fileData.version++;
            fileData.lastModified = Date.now();

            // 广播更改给其他用户
            socket.to(currentProjectId).emit('doc-change', {
                file,
                changes,
                version: fileData.version,
                userId: socket.id
            });

        } catch (error) {
            console.error('处理文档更改时出错:', error);
        }
    });

    // 处理完整文档同步（用于解决冲突）
    socket.on('doc-sync', ({ file, content }) => {
        if (!currentProjectId || !currentUser) return;

        const project = projects.get(currentProjectId);
        if (!project || !project.files[file]) return;

        project.files[file].content = content;
        project.files[file].version++;
        project.files[file].lastModified = Date.now();

        // 广播给其他用户
        socket.to(currentProjectId).emit('doc-sync', {
            file,
            content,
            version: project.files[file].version,
            userId: socket.id
        });
    });

    // 处理光标位置更新
    socket.on('cursor-update', ({ file, cursor }) => {
        if (!currentProjectId || !currentUser) return;

        const project = projects.get(currentProjectId);
        if (!project) return;

        project.cursors.set(socket.id, { file, cursor, user: currentUser });

        // 广播给其他用户
        socket.to(currentProjectId).emit('cursor-update', {
            userId: socket.id,
            file,
            cursor,
            user: currentUser
        });
    });

    // 处理选择更新
    socket.on('selection-update', ({ file, selection }) => {
        if (!currentProjectId || !currentUser) return;

        socket.to(currentProjectId).emit('selection-update', {
            userId: socket.id,
            file,
            selection,
            user: currentUser
        });
    });

    // 切换文件
    socket.on('switch-file', (filename) => {
        if (!currentProjectId || !currentUser) return;

        currentFile = filename;
        currentUser.currentFile = filename;

        const project = projects.get(currentProjectId);
        if (project) {
            project.users.set(socket.id, currentUser);
        }

        socket.to(currentProjectId).emit('user-switch-file', {
            userId: socket.id,
            file: filename
        });
    });

    // 创建新文件
    socket.on('create-file', ({ filename }) => {
        if (!currentProjectId || !currentUser) return;

        const project = projects.get(currentProjectId);
        if (!project) return;

        if (!project.files[filename]) {
            project.files[filename] = {
                content: '',
                version: 1,
                lastModified: Date.now()
            };

            io.to(currentProjectId).emit('file-created', {
                filename,
                content: ''
            });
        }
    });

    // 删除文件
    socket.on('delete-file', ({ filename }) => {
        if (!currentProjectId || !currentUser) return;

        const project = projects.get(currentProjectId);
        if (!project || filename === 'main.tex') return; // 不允许删除主文件

        if (project.files[filename]) {
            delete project.files[filename];
            io.to(currentProjectId).emit('file-deleted', { filename });
        }
    });

    // 重命名文件
    socket.on('rename-file', ({ oldName, newName }) => {
        if (!currentProjectId || !currentUser) return;

        const project = projects.get(currentProjectId);
        if (!project || oldName === 'main.tex') return;

        if (project.files[oldName] && !project.files[newName]) {
            project.files[newName] = project.files[oldName];
            delete project.files[oldName];
            io.to(currentProjectId).emit('file-renamed', { oldName, newName });
        }
    });

    // 聊天消息
    socket.on('chat-message', (message) => {
        if (!currentProjectId || !currentUser) return;

        io.to(currentProjectId).emit('chat-message', {
            user: currentUser,
            message,
            timestamp: Date.now()
        });
    });

    // 用户断开连接
    socket.on('disconnect', () => {
        console.log(`用户断开连接: ${socket.id}`);

        if (currentProjectId) {
            const project = projects.get(currentProjectId);
            if (project) {
                project.users.delete(socket.id);
                project.cursors.delete(socket.id);

                // 通知其他用户
                socket.to(currentProjectId).emit('user-left', {
                    userId: socket.id,
                    username: currentUser?.username
                });
            }
        }

        users.delete(socket.id);
    });

    // 请求当前文档内容（用于同步）
    socket.on('request-sync', ({ file }) => {
        if (!currentProjectId) return;

        const project = projects.get(currentProjectId);
        if (!project || !project.files[file]) return;

        socket.emit('doc-sync', {
            file,
            content: project.files[file].content,
            version: project.files[file].version
        });
    });

    // 获取项目列表
    socket.on('get-projects', () => {
        const projectList = Array.from(projects.values()).map(p => ({
            id: p.id,
            name: p.name,
            fileCount: Object.keys(p.files).length,
            userCount: p.users.size,
            created: p.created
        }));
        socket.emit('projects-list', projectList);
    });

    // 创建新项目
    socket.on('create-project', ({ name }) => {
        const project = createDefaultProject();
        project.name = name || '新项目';
        projects.set(project.id, project);
        saveProjectsToDisk();

        socket.emit('project-created', {
            id: project.id,
            name: project.name
        });
    });
});

// 生成随机颜色
function getRandomColor() {
    const colors = [
        '#e91e63', '#9c27b0', '#673ab7', '#3f51b5',
        '#2196f3', '#00bcd4', '#009688', '#4caf50',
        '#ff9800', '#ff5722', '#795548', '#607d8b'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// 路由：主页（项目列表）
app.get('/home', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/home.html'));
});

// 保存数据并退出
process.on('SIGINT', () => {
    console.log('\n正在保存项目数据...');
    saveProjectsToDisk();
    console.log('数据已保存，退出程序');
    process.exit(0);
});

process.on('SIGTERM', () => {
    saveProjectsToDisk();
    process.exit(0);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`WebTeX 服务器运行在 http://localhost:${PORT}`);
    console.log(`项目主页: http://localhost:${PORT}/home`);
    console.log(`当前项目数量: ${projects.size}`);
});
