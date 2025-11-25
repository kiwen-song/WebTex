// WebTeX - 在线协同LaTeX编辑器 (带本地编译)

class WebTeX {
    constructor() {
        this.socket = null;
        this.editor = null;
        this.currentUser = null;
        this.currentFile = 'main.tex';
        this.projectId = null;
        this.projectName = '';
        this.files = {};
        this.folders = [];
        this.users = new Map();
        this.remoteCursors = new Map();
        this.isLocalChange = false;
        this.unreadMessages = 0;

        // 编译相关
        this.compilerUrl = localStorage.getItem('webtex-compiler-url') || 'http://localhost:8088';
        this.compilerAvailable = false;
        this.availableCompilers = [];
        this.currentCompiler = localStorage.getItem('webtex-compiler') || 'xelatex';
        this.mainFile = 'main.tex';
        this.isCompiling = false;
        this.currentPdfData = null;
        this.autoCompile = localStorage.getItem('webtex-auto-compile') === 'true';
        this.compileTimeout = null;

        // 缩放
        this.zoomLevel = 100;

        this.init();
    }

    async init() {
        // 检查URL参数中是否有项目ID
        const urlParams = new URLSearchParams(window.location.search);
        const projectIdFromUrl = urlParams.get('project');
        if (projectIdFromUrl) {
            document.getElementById('project-id').value = projectIdFromUrl;
        }

        await this.checkCompiler();
        this.initSocket();
        this.initEventListeners();
        this.initResizer();
        this.initFileUpload();
        this.loadSettings();
    }

    // ===== 检查本地编译服务 =====
    async checkCompiler() {
        const statusEl = document.getElementById('login-compiler-status');
        const settingsStatusEl = document.getElementById('settings-compiler-status');

        try {
            const response = await fetch(`${this.compilerUrl}/health`, {
                method: 'GET',
                timeout: 3000
            });
            const data = await response.json();

            if (data.status === 'ok' && data.latex?.installed) {
                this.compilerAvailable = true;
                this.availableCompilers = data.compilers || [];

                const html = `<i class="fas fa-check-circle"></i><span>编译服务已连接 (${this.availableCompilers.length} 个编译器可用)</span>`;
                if (statusEl) {
                    statusEl.innerHTML = html;
                    statusEl.classList.add('success');
                }
                if (settingsStatusEl) {
                    settingsStatusEl.innerHTML = html;
                    settingsStatusEl.classList.add('success');
                }

                // 更新编译器下拉列表
                this.updateCompilerSelect();
            } else {
                throw new Error('LaTeX not installed');
            }
        } catch (error) {
            this.compilerAvailable = false;
            const html = `<i class="fas fa-exclamation-triangle"></i><span>编译服务未连接 - 请运行 local-compiler</span>`;
            if (statusEl) {
                statusEl.innerHTML = html;
                statusEl.classList.add('error');
            }
            if (settingsStatusEl) {
                settingsStatusEl.innerHTML = html;
                settingsStatusEl.classList.add('error');
            }
        }
    }

    // 更新编译器选择下拉列表
    updateCompilerSelect() {
        const select = document.getElementById('compiler-select');
        if (!select) return;

        select.innerHTML = '';
        this.availableCompilers.forEach(compiler => {
            const option = document.createElement('option');
            option.value = compiler.id;
            option.textContent = compiler.name;
            if (compiler.id === this.currentCompiler) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    }

    // ===== Socket.io =====
    initSocket() {
        this.socket = io();

        this.socket.on('connect', () => console.log('已连接到服务器'));
        this.socket.on('disconnect', () => this.showToast('与服务器断开连接', 'error'));
        this.socket.on('project-data', (data) => this.handleProjectData(data));
        this.socket.on('project-updated', (data) => this.handleProjectUpdated(data));
        this.socket.on('user-joined', (user) => this.handleUserJoined(user));
        this.socket.on('user-left', (data) => this.handleUserLeft(data));
        this.socket.on('doc-change', (data) => this.handleRemoteChange(data));
        this.socket.on('doc-sync', (data) => this.handleDocSync(data));
        this.socket.on('cursor-update', (data) => this.handleCursorUpdate(data));
        this.socket.on('user-switch-file', (data) => this.handleUserSwitchFile(data));
        this.socket.on('file-created', (data) => this.handleFileCreated(data));
        this.socket.on('file-deleted', (data) => this.handleFileDeleted(data));
        this.socket.on('files-uploaded', (data) => this.handleFilesUploaded(data));
        this.socket.on('folder-created', (data) => this.handleFolderCreated(data));
        this.socket.on('chat-message', (data) => this.handleChatMessage(data));
    }

    // ===== 事件监听 =====
    initEventListeners() {
        // 登录
        document.getElementById('join-btn').addEventListener('click', () => this.joinProject());
        document.getElementById('username').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinProject();
        });

        // 颜色选择
        document.querySelectorAll('.color-option').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
            });
        });

        // 工具栏
        document.getElementById('btn-compile').addEventListener('click', () => this.compile());
        document.getElementById('btn-download').addEventListener('click', () => this.downloadCurrentFile());
        document.getElementById('btn-download-all').addEventListener('click', () => this.downloadAllFiles());
        document.getElementById('btn-download-pdf').addEventListener('click', () => this.downloadPdf());
        document.getElementById('btn-undo').addEventListener('click', () => this.editor?.undo());
        document.getElementById('btn-redo').addEventListener('click', () => this.editor?.redo());
        document.getElementById('btn-bold').addEventListener('click', () => this.insertLatex('\\textbf{', '}'));
        document.getElementById('btn-italic').addEventListener('click', () => this.insertLatex('\\textit{', '}'));
        document.getElementById('btn-math').addEventListener('click', () => this.insertLatex('$', '$'));
        document.getElementById('btn-equation').addEventListener('click', () =>
            this.insertLatex('\\begin{equation}\n  ', '\n\\end{equation}'));

        // 面板切换
        document.getElementById('btn-chat').addEventListener('click', () => this.toggleChat());
        document.getElementById('btn-close-chat').addEventListener('click', () => this.toggleChat());
        document.getElementById('btn-logs').addEventListener('click', () => this.toggleLogs());
        document.getElementById('btn-close-logs').addEventListener('click', () => this.toggleLogs());
        document.getElementById('btn-settings').addEventListener('click', () => this.showSettings());
        document.getElementById('btn-close-settings').addEventListener('click', () => this.hideSettings());
        document.getElementById('btn-save-settings').addEventListener('click', () => this.saveSettings());

        // 文件操作
        document.getElementById('btn-new-file').addEventListener('click', () => this.showNewFileModal());
        document.getElementById('btn-cancel-new-file').addEventListener('click', () => this.hideNewFileModal());
        document.getElementById('btn-confirm-new-file').addEventListener('click', () => this.createNewFile());
        document.getElementById('btn-copy-id').addEventListener('click', () => this.copyProjectId());

        // 新增：上传文件和文件夹
        const uploadBtn = document.getElementById('btn-upload-file');
        if (uploadBtn) uploadBtn.addEventListener('click', () => this.showUploadModal());

        const newFolderBtn = document.getElementById('btn-new-folder');
        if (newFolderBtn) newFolderBtn.addEventListener('click', () => this.showNewFolderModal());

        const homeBtn = document.getElementById('btn-home');
        if (homeBtn) homeBtn.addEventListener('click', () => window.location.href = '/home');

        // 编译器选择
        const compilerSelect = document.getElementById('compiler-select');
        if (compilerSelect) {
            compilerSelect.addEventListener('change', (e) => {
                this.currentCompiler = e.target.value;
                localStorage.setItem('webtex-compiler', this.currentCompiler);
                this.showToast(`已切换到 ${e.target.options[e.target.selectedIndex].text}`, 'info');
            });
        }

        // 聊天
        document.getElementById('btn-send-chat').addEventListener('click', () => this.sendChatMessage());
        document.getElementById('chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage();
        });

        // 日志标签
        document.querySelectorAll('.log-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.log-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.log-tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(`log-${tab.dataset.tab}`).classList.add('active');
            });
        });

        // PDF缩放
        document.getElementById('btn-zoom-in').addEventListener('click', () => this.setZoom(this.zoomLevel + 25));
        document.getElementById('btn-zoom-out').addEventListener('click', () => this.setZoom(this.zoomLevel - 25));
        document.getElementById('btn-zoom-fit').addEventListener('click', () => this.setZoom(100));

        // 快捷键
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.compile();
            }
        });
    }

    // ===== 文件上传初始化 =====
    initFileUpload() {
        const fileList = document.getElementById('file-list');
        if (!fileList) return;

        // 拖拽上传到文件列表区域
        fileList.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileList.classList.add('drag-over');
        });

        fileList.addEventListener('dragleave', () => {
            fileList.classList.remove('drag-over');
        });

        fileList.addEventListener('drop', async (e) => {
            e.preventDefault();
            fileList.classList.remove('drag-over');

            const files = e.dataTransfer.files;
            if (files.length > 0) {
                await this.uploadFiles(files);
            }
        });
    }

    // ===== 分割条拖拽 =====
    initResizer() {
        const resizer = document.getElementById('resizer');
        const editorPane = document.getElementById('editor-pane');
        const previewPane = document.getElementById('preview-pane');
        let isResizing = false;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            resizer.classList.add('dragging');
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            const container = document.querySelector('.editor-preview-container');
            const containerRect = container.getBoundingClientRect();
            const percentage = ((e.clientX - containerRect.left) / containerRect.width) * 100;

            if (percentage > 20 && percentage < 80) {
                editorPane.style.flex = `0 0 ${percentage}%`;
                previewPane.style.flex = `0 0 ${100 - percentage}%`;
            }
        });

        document.addEventListener('mouseup', () => {
            isResizing = false;
            resizer.classList.remove('dragging');
        });
    }

    // ===== 加入项目 =====
    joinProject() {
        const username = document.getElementById('username').value.trim() || `用户${Math.floor(Math.random() * 1000)}`;
        const projectId = document.getElementById('project-id').value.trim();
        const color = document.querySelector('.color-option.selected')?.dataset.color || '#4a90d9';

        this.currentUser = { username, color };
        this.socket.emit('join-project', { projectId: projectId || null, username, color });
    }

    // ===== 处理项目数据 =====
    handleProjectData(data) {
        this.projectId = data.projectId;
        this.projectName = data.projectName;
        this.files = data.files;
        this.folders = data.folders || [];
        this.mainFile = data.mainFile || 'main.tex';

        // 使用项目的编译器设置
        if (data.compiler && this.availableCompilers.find(c => c.id === data.compiler)) {
            this.currentCompiler = data.compiler;
        }

        document.getElementById('login-modal').classList.add('hidden');
        document.getElementById('main-container').classList.remove('hidden');

        document.getElementById('project-name').textContent = data.projectName;
        document.getElementById('display-project-id').textContent = data.projectId.substring(0, 8);

        this.initEditor();
        this.updateFileList();
        this.updateCompilerSelect();

        data.users.forEach(user => this.users.set(user.id, user));
        this.updateOnlineUsers();

        // 打开主文件
        if (this.files[this.mainFile]) {
            this.switchFile(this.mainFile);
        } else if (this.files['main.tex']) {
            this.switchFile('main.tex');
        }

        this.showToast('已加入项目', 'success');
    }

    // 处理项目设置更新
    handleProjectUpdated(data) {
        if (data.name) {
            this.projectName = data.name;
            document.getElementById('project-name').textContent = data.name;
        }
        if (data.compiler) {
            this.currentCompiler = data.compiler;
            this.updateCompilerSelect();
        }
        if (data.mainFile) {
            this.mainFile = data.mainFile;
        }
        this.showToast('项目设置已更新', 'info');
    }

    // ===== 初始化编辑器 =====
    initEditor() {
        this.editor = CodeMirror.fromTextArea(document.getElementById('editor'), {
            mode: 'stex',
            theme: localStorage.getItem('webtex-theme') || 'monokai',
            lineNumbers: true,
            lineWrapping: true,
            matchBrackets: true,
            autoCloseBrackets: true,
            foldGutter: true,
            gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
            extraKeys: {
                'Ctrl-S': () => this.compile(),
                'Ctrl-/': 'toggleComment'
            }
        });

        this.editor.on('changes', (cm, changes) => {
            if (this.isLocalChange) return;

            const localChanges = changes.filter(c => c.origin !== 'setValue' && c.origin !== 'remote');
            if (localChanges.length === 0) return;

            this.socket.emit('doc-change', {
                file: this.currentFile,
                changes: localChanges.map(c => ({ from: c.from, to: c.to, text: c.text, origin: c.origin })),
                version: this.files[this.currentFile]?.version || 1
            });

            if (this.files[this.currentFile]) {
                this.files[this.currentFile].content = cm.getValue();
            }

            document.getElementById('doc-status').textContent = '已修改';

            // 自动编译
            if (this.autoCompile) {
                clearTimeout(this.compileTimeout);
                this.compileTimeout = setTimeout(() => this.compile(), 2000);
            }
        });

        this.editor.on('cursorActivity', (cm) => {
            const cursor = cm.getCursor();
            document.getElementById('cursor-position').textContent = `行 ${cursor.line + 1}, 列 ${cursor.ch + 1}`;
            this.socket.emit('cursor-update', { file: this.currentFile, cursor });
        });

        this.applyEditorSettings();
    }

    // ===== 编译 =====
    async compile() {
        if (!this.compilerAvailable) {
            this.showToast('本地编译服务未连接，请先启动 local-compiler', 'error');
            return;
        }

        if (this.isCompiling) {
            this.showToast('正在编译中...', 'info');
            return;
        }

        this.isCompiling = true;
        this.updateCompileStatus('compiling', '编译中...');

        const compileBtn = document.getElementById('btn-compile');
        compileBtn.classList.add('compiling');
        compileBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>编译中</span>';

        try {
            // 通过服务器 API 编译（服务器会组装所有文件包括资源文件）
            const response = await fetch(`/api/projects/${this.projectId}/compile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    compilerUrl: this.compilerUrl,
                    compiler: this.currentCompiler
                })
            });

            const result = await response.json();

            // 更新日志
            document.getElementById('compile-log').textContent = result.log || '无日志输出';

            // 更新错误列表
            const errorList = document.getElementById('error-list');
            errorList.innerHTML = '';
            if (result.errors && result.errors.length > 0) {
                result.errors.forEach(err => {
                    const div = document.createElement('div');
                    div.className = 'error-item';
                    div.innerHTML = `<div>${err.message}</div><div class="line">行 ${err.line} - ${err.file || 'main.tex'}</div>`;
                    div.onclick = () => this.goToLine(err.line);
                    errorList.appendChild(div);
                });
            }
            document.getElementById('error-count').textContent = `(${result.errors?.length || 0})`;

            // 更新警告列表
            const warningList = document.getElementById('warning-list');
            warningList.innerHTML = '';
            if (result.warnings && result.warnings.length > 0) {
                result.warnings.forEach(warn => {
                    const div = document.createElement('div');
                    div.className = 'warning-item';
                    div.textContent = warn.message;
                    warningList.appendChild(div);
                });
            }
            document.getElementById('warning-count').textContent = `(${result.warnings?.length || 0})`;

            if (result.success && result.pdf) {
                // 显示PDF
                this.currentPdfData = result.pdf;
                this.displayPdf(result.pdf);
                this.updateCompileStatus('ready', '编译成功');
                document.getElementById('btn-download-pdf').disabled = false;
                this.showToast('编译成功', 'success');
            } else {
                this.updateCompileStatus('error', '编译失败');
                this.showToast(result.message || '编译失败', 'error');
                // 显示日志面板
                document.getElementById('logs-panel').classList.remove('hidden');
            }

        } catch (error) {
            console.error('编译错误:', error);
            this.updateCompileStatus('error', '编译出错');
            this.showToast('编译服务连接失败', 'error');
        } finally {
            this.isCompiling = false;
            compileBtn.classList.remove('compiling');
            compileBtn.innerHTML = '<i class="fas fa-play"></i><span>编译</span>';
        }
    }

    updateCompileStatus(status, text) {
        const el = document.getElementById('compile-status');
        el.className = `compile-status ${status}`;
        el.querySelector('.status-text').textContent = text;
    }

    displayPdf(base64Data) {
        const pdfViewer = document.getElementById('pdf-viewer');
        const placeholder = document.getElementById('preview-placeholder');

        // 创建Blob URL
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);

        pdfViewer.src = url;
        pdfViewer.classList.remove('hidden');
        placeholder.classList.add('hidden');
    }

    setZoom(level) {
        this.zoomLevel = Math.max(50, Math.min(200, level));
        document.getElementById('zoom-level').textContent = `${this.zoomLevel}%`;

        const pdfViewer = document.getElementById('pdf-viewer');
        pdfViewer.style.transform = `scale(${this.zoomLevel / 100})`;
        pdfViewer.style.transformOrigin = 'top left';
        pdfViewer.style.width = `${100 / (this.zoomLevel / 100)}%`;
        pdfViewer.style.height = `${100 / (this.zoomLevel / 100)}%`;
    }

    goToLine(line) {
        if (this.editor && line > 0) {
            this.editor.setCursor({ line: line - 1, ch: 0 });
            this.editor.focus();
        }
    }

    // ===== 切换文件 =====
    switchFile(filename) {
        if (!this.files[filename]) return;

        this.currentFile = filename;

        const file = this.files[filename];

        if (file.isAsset) {
            // 资源文件不能编辑，显示预览信息
            this.isLocalChange = true;
            this.editor.setValue(`% 此文件是资源文件 (${filename})\n% 不可编辑，可在LaTeX中使用以下命令引用：\n% \\includegraphics{${filename}}`);
            this.isLocalChange = false;
            this.showToast('资源文件不可编辑', 'info');
        } else {
            this.isLocalChange = true;
            this.editor.setValue(file.content || '');
            this.isLocalChange = false;
        }

        this.socket.emit('switch-file', filename);
        this.updateFileList();
        this.updateFileTabs();
        this.clearRemoteCursors();

        document.getElementById('doc-status').textContent = '已同步';
    }

    updateFileList() {
        const fileList = document.getElementById('file-list');
        fileList.innerHTML = '';

        // 先显示文件夹
        this.folders.forEach(folder => {
            const folderItem = document.createElement('div');
            folderItem.className = 'folder-item';
            folderItem.innerHTML = `
                <i class="fas fa-folder"></i>
                <span class="folder-name">${folder}</span>
            `;
            fileList.appendChild(folderItem);
        });

        // 获取文件图标
        const getFileIcon = (filename) => {
            if (filename.endsWith('.tex')) return 'fa-file-code';
            if (filename.endsWith('.bib')) return 'fa-book';
            if (filename.endsWith('.sty') || filename.endsWith('.cls')) return 'fa-file-alt';
            if (filename.match(/\.(png|jpg|jpeg|gif|svg)$/i)) return 'fa-image';
            if (filename.endsWith('.pdf')) return 'fa-file-pdf';
            return 'fa-file';
        };

        // 显示文件
        Object.keys(this.files).sort().forEach(filename => {
            const file = this.files[filename];
            const isAsset = file.isAsset;

            const item = document.createElement('div');
            item.className = `file-item ${filename === this.currentFile ? 'active' : ''} ${isAsset ? 'asset' : ''}`;

            const icon = getFileIcon(filename);
            const isMainFile = filename === this.mainFile || filename === 'main.tex';

            item.innerHTML = `
                <i class="fas ${icon}"></i>
                <span class="file-name">${filename}</span>
                ${isMainFile ? '<span class="main-badge" title="主文件">主</span>' : ''}
                <div class="file-users">
                    ${this.getFileUsers(filename).map(u =>
                `<div class="file-user-dot" style="background:${u.color}" title="${u.username}"></div>`
            ).join('')}
                </div>
                ${!isMainFile ? `
                <div class="file-actions">
                    <button onclick="event.stopPropagation(); app.deleteFile('${filename}')" title="删除">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>` : ''}
            `;

            item.onclick = () => {
                if (!isAsset) {
                    this.switchFile(filename);
                } else {
                    // 资源文件显示预览
                    this.previewAsset(filename, file.assetPath);
                }
            };

            fileList.appendChild(item);
        });
    }

    previewAsset(filename, assetPath) {
        const ext = filename.split('.').pop().toLowerCase();
        if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) {
            // 图片预览
            window.open(assetPath, '_blank');
        } else if (ext === 'pdf') {
            window.open(assetPath, '_blank');
        }
        this.showToast(`资源文件: ${filename}`, 'info');
    }

    updateFileTabs() {
        const tabs = document.getElementById('file-tabs');
        tabs.innerHTML = `
      <div class="file-tab active">
        <i class="fas fa-file-code"></i>
        <span>${this.currentFile}</span>
      </div>
    `;
    }

    getFileUsers(filename) {
        return Array.from(this.users.values()).filter(u =>
            u.currentFile === filename && u.id !== this.socket.id
        );
    }

    updateOnlineUsers() {
        const container = document.getElementById('online-users');
        container.innerHTML = '';

        this.users.forEach(user => {
            const avatar = document.createElement('div');
            avatar.className = 'user-avatar';
            avatar.style.background = user.color;
            avatar.textContent = user.username.charAt(0).toUpperCase();
            avatar.title = user.username;
            container.appendChild(avatar);
        });

        document.getElementById('user-count').textContent = `${this.users.size} 人在线`;
    }

    // ===== 用户事件处理 =====
    handleUserJoined(user) {
        this.users.set(user.id, user);
        this.updateOnlineUsers();
        this.updateFileList();
        this.showToast(`${user.username} 加入了编辑`, 'info');
    }

    handleUserLeft(data) {
        this.users.delete(data.userId);
        this.removeRemoteCursor(data.userId);
        this.updateOnlineUsers();
        this.updateFileList();
        if (data.username) this.showToast(`${data.username} 离开了`, 'info');
    }

    handleRemoteChange(data) {
        if (data.file !== this.currentFile) return;

        this.isLocalChange = true;
        try {
            data.changes.forEach(change => {
                this.editor.replaceRange(change.text.join('\n'), change.from, change.to, 'remote');
            });
        } catch (e) {
            this.socket.emit('request-sync', { file: this.currentFile });
        }
        this.isLocalChange = false;

        if (this.files[this.currentFile]) {
            this.files[this.currentFile].content = this.editor.getValue();
            this.files[this.currentFile].version = data.version;
        }
    }

    handleDocSync(data) {
        if (data.file === this.currentFile) {
            this.isLocalChange = true;
            const cursor = this.editor.getCursor();
            this.editor.setValue(data.content);
            this.editor.setCursor(cursor);
            this.isLocalChange = false;
        }

        if (this.files[data.file]) {
            this.files[data.file].content = data.content;
            this.files[data.file].version = data.version;
        }
    }

    handleCursorUpdate(data) {
        if (data.file !== this.currentFile) {
            this.removeRemoteCursor(data.userId);
            return;
        }
        this.showRemoteCursor(data.userId, data.cursor, data.user);
    }

    showRemoteCursor(userId, cursor, user) {
        this.removeRemoteCursor(userId);

        const cursorEl = document.createElement('div');
        cursorEl.className = 'remote-cursor';
        cursorEl.style.borderLeft = `2px solid ${user.color}`;

        const flag = document.createElement('div');
        flag.className = 'remote-cursor-flag';
        flag.style.background = user.color;
        flag.textContent = user.username;
        cursorEl.appendChild(flag);

        const coords = this.editor.cursorCoords(cursor, 'local');
        cursorEl.style.left = coords.left + 'px';
        cursorEl.style.top = coords.top + 'px';
        cursorEl.style.height = (coords.bottom - coords.top) + 'px';

        const scroller = this.editor.getWrapperElement().querySelector('.CodeMirror-sizer');
        scroller.appendChild(cursorEl);

        this.remoteCursors.set(userId, { element: cursorEl });

        setTimeout(() => { if (flag.parentElement) flag.style.opacity = '0'; }, 2000);
    }

    removeRemoteCursor(userId) {
        const cursor = this.remoteCursors.get(userId);
        if (cursor) {
            cursor.element.remove();
            this.remoteCursors.delete(userId);
        }
    }

    clearRemoteCursors() {
        this.remoteCursors.forEach(c => c.element.remove());
        this.remoteCursors.clear();
    }

    handleUserSwitchFile(data) {
        const user = this.users.get(data.userId);
        if (user) {
            user.currentFile = data.file;
            this.users.set(data.userId, user);
            this.updateFileList();
        }
        if (data.file !== this.currentFile) this.removeRemoteCursor(data.userId);
    }

    // ===== 文件操作 =====
    showNewFileModal() {
        document.getElementById('new-file-modal').classList.remove('hidden');
        document.getElementById('new-filename').value = '';
        document.getElementById('new-filename').focus();
    }

    hideNewFileModal() {
        document.getElementById('new-file-modal').classList.add('hidden');
    }

    createNewFile() {
        let filename = document.getElementById('new-filename').value.trim();
        if (!filename) return this.showToast('请输入文件名', 'error');

        if (!filename.match(/\.(tex|bib|sty|cls)$/)) filename += '.tex';
        if (this.files[filename]) return this.showToast('文件已存在', 'error');

        this.socket.emit('create-file', { filename });
        this.hideNewFileModal();
    }

    handleFileCreated(data) {
        this.files[data.filename] = { content: data.content, version: 1 };
        this.updateFileList();
        this.showToast(`文件 ${data.filename} 已创建`, 'success');
    }

    deleteFile(filename) {
        if (filename === 'main.tex') return this.showToast('不能删除主文件', 'error');
        if (confirm(`确定删除 ${filename}？`)) {
            this.socket.emit('delete-file', { filename });
        }
    }

    handleFileDeleted(data) {
        delete this.files[data.filename];
        if (this.currentFile === data.filename) this.switchFile('main.tex');
        this.updateFileList();
    }

    // ===== 文件上传 =====
    showUploadModal() {
        const modal = document.getElementById('upload-modal');
        if (modal) {
            modal.classList.remove('hidden');
        } else {
            // 如果没有modal，直接打开文件选择
            this.openFileSelector();
        }
    }

    hideUploadModal() {
        const modal = document.getElementById('upload-modal');
        if (modal) modal.classList.add('hidden');
    }

    openFileSelector() {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '.tex,.bib,.sty,.cls,.png,.jpg,.jpeg,.gif,.svg,.pdf,.txt,.md';
        input.onchange = (e) => this.uploadFiles(e.target.files);
        input.click();
    }

    async uploadFiles(files) {
        if (!this.projectId) {
            this.showToast('请先加入项目', 'error');
            return;
        }

        const formData = new FormData();
        for (const file of files) {
            formData.append('files', file);
        }

        try {
            this.showToast('正在上传文件...', 'info');

            const response = await fetch(`/api/projects/${this.projectId}/upload`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                this.showToast(`已上传 ${result.files.length} 个文件`, 'success');
                this.hideUploadModal();
            } else {
                this.showToast(result.error || '上传失败', 'error');
            }
        } catch (error) {
            console.error('上传文件失败:', error);
            this.showToast('上传文件失败', 'error');
        }
    }

    // 处理服务器发来的文件上传通知
    handleFilesUploaded(data) {
        data.files.forEach(file => {
            if (file.isAsset) {
                this.files[file.path] = {
                    content: null,
                    isAsset: true,
                    assetPath: `/uploads/${this.projectId}/${file.path}`,
                    version: 1
                };
            } else {
                // 文本文件需要从服务器获取内容
                this.fetchFileContent(file.path);
            }
        });
        this.updateFileList();
        this.showToast(`收到 ${data.files.length} 个新文件`, 'info');
    }

    async fetchFileContent(filePath) {
        try {
            const response = await fetch(`/api/projects/${this.projectId}/files/${encodeURIComponent(filePath)}`);
            const data = await response.json();

            if (data.isAsset) {
                this.files[filePath] = {
                    content: null,
                    isAsset: true,
                    assetPath: data.assetPath,
                    version: 1
                };
            } else {
                this.files[filePath] = {
                    content: data.content,
                    version: data.version
                };
            }
            this.updateFileList();
        } catch (error) {
            console.error('获取文件内容失败:', error);
        }
    }

    // ===== 文件夹操作 =====
    showNewFolderModal() {
        const folderName = prompt('请输入文件夹名称:');
        if (folderName && folderName.trim()) {
            this.createFolder(folderName.trim());
        }
    }

    async createFolder(folderPath) {
        if (!this.projectId) {
            this.showToast('请先加入项目', 'error');
            return;
        }

        try {
            const response = await fetch(`/api/projects/${this.projectId}/folders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderPath })
            });

            const result = await response.json();
            if (result.success) {
                this.showToast(`文件夹 ${folderPath} 已创建`, 'success');
            } else {
                this.showToast(result.error || '创建失败', 'error');
            }
        } catch (error) {
            console.error('创建文件夹失败:', error);
            this.showToast('创建文件夹失败', 'error');
        }
    }

    handleFolderCreated(data) {
        if (!this.folders.includes(data.folderPath)) {
            this.folders.push(data.folderPath);
            this.updateFileList();
        }
    }

    // ===== LaTeX插入 =====
    insertLatex(before, after) {
        const selection = this.editor.getSelection();
        const cursor = this.editor.getCursor();

        if (selection) {
            this.editor.replaceSelection(before + selection + after);
        } else {
            this.editor.replaceRange(before + after, cursor);
            this.editor.setCursor({ line: cursor.line, ch: cursor.ch + before.length });
        }
        this.editor.focus();
    }

    // ===== 下载功能 =====
    downloadCurrentFile() {
        const content = this.editor.getValue();
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        saveAs(blob, this.currentFile);
        this.showToast(`${this.currentFile} 已下载`, 'success');
    }

    async downloadAllFiles() {
        const zip = new JSZip();
        Object.entries(this.files).forEach(([name, file]) => {
            zip.file(name, file.content);
        });
        const content = await zip.generateAsync({ type: 'blob' });
        saveAs(content, 'latex-project.zip');
        this.showToast('项目已打包下载', 'success');
    }

    downloadPdf() {
        if (!this.currentPdfData) {
            this.showToast('请先编译生成PDF', 'error');
            return;
        }

        const byteCharacters = atob(this.currentPdfData);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        saveAs(blob, 'document.pdf');
        this.showToast('PDF已下载', 'success');
    }

    copyProjectId() {
        navigator.clipboard.writeText(this.projectId);
        this.showToast('项目ID已复制', 'success');
    }

    // ===== 面板切换 =====
    toggleChat() {
        const panel = document.getElementById('chat-panel');
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) {
            this.unreadMessages = 0;
            document.getElementById('chat-badge').classList.add('hidden');
            document.getElementById('chat-input').focus();
        }
    }

    toggleLogs() {
        document.getElementById('logs-panel').classList.toggle('hidden');
    }

    sendChatMessage() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        if (message) {
            this.socket.emit('chat-message', message);
            input.value = '';
        }
    }

    handleChatMessage(data) {
        const container = document.getElementById('chat-messages');
        const isOwn = data.user.id === this.socket.id;

        const el = document.createElement('div');
        el.className = `chat-message ${isOwn ? 'own' : ''}`;
        el.innerHTML = `
      <div class="message-header">
        <span class="message-user" style="color:${data.user.color}">${data.user.username}</span>
        <span class="message-time">${new Date(data.timestamp).toLocaleTimeString()}</span>
      </div>
      <div class="message-content">${this.escapeHtml(data.message)}</div>
    `;

        container.appendChild(el);
        container.scrollTop = container.scrollHeight;

        if (document.getElementById('chat-panel').classList.contains('hidden') && !isOwn) {
            this.unreadMessages++;
            const badge = document.getElementById('chat-badge');
            badge.textContent = this.unreadMessages;
            badge.classList.remove('hidden');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ===== 设置 =====
    showSettings() {
        document.getElementById('settings-modal').classList.remove('hidden');
        this.checkCompiler();
    }

    hideSettings() {
        document.getElementById('settings-modal').classList.add('hidden');
    }

    loadSettings() {
        document.getElementById('font-size').value = localStorage.getItem('webtex-font-size') || '14';
        document.getElementById('theme').value = localStorage.getItem('webtex-theme') || 'monokai';
        document.getElementById('auto-compile').checked = localStorage.getItem('webtex-auto-compile') === 'true';
        document.getElementById('compiler-url').value = this.compilerUrl;
    }

    saveSettings() {
        localStorage.setItem('webtex-font-size', document.getElementById('font-size').value);
        localStorage.setItem('webtex-theme', document.getElementById('theme').value);
        localStorage.setItem('webtex-auto-compile', document.getElementById('auto-compile').checked);
        localStorage.setItem('webtex-compiler-url', document.getElementById('compiler-url').value);

        this.compilerUrl = document.getElementById('compiler-url').value;
        this.autoCompile = document.getElementById('auto-compile').checked;

        this.applyEditorSettings();
        this.checkCompiler();
        this.hideSettings();
        this.showToast('设置已保存', 'success');
    }

    applyEditorSettings() {
        if (!this.editor) return;

        const fontSize = localStorage.getItem('webtex-font-size') || '14';
        const theme = localStorage.getItem('webtex-theme') || 'monokai';

        this.editor.getWrapperElement().style.fontSize = fontSize + 'px';
        this.editor.setOption('theme', theme);
        this.editor.refresh();
    }

    // ===== Toast =====
    showToast(message, type = 'info') {
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<i class="fas ${icons[type]}"></i><span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// 启动
const app = new WebTeX();
