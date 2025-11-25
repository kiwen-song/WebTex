# WebTeX - 在线协作 LaTeX 编辑器

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
  <img src="https://img.shields.io/badge/node-%3E%3D16.0.0-green.svg" alt="Node">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg" alt="Platform">
</p>

**WebTeX** 是一个类似 Overleaf 的在线协作 LaTeX 编辑器，但使用**本地 LaTeX 编译**。支持多人实时协作编辑、即时 PDF 预览、多种编译器选择。

[English](#english) | [中文](#中文)

---

## 中文

### ✨ 特性

- 🔄 **实时协作** - 多人同时编辑，实时同步，支持光标位置显示
- 📝 **语法高亮** - 基于 CodeMirror 的 LaTeX 语法高亮
- 🖥️ **本地编译** - 使用你本地安装的 LaTeX（MiKTeX/TeX Live），无需上传到云端
- 📄 **PDF 预览** - 编译后即时在浏览器中预览 PDF
- 🔧 **多编译器** - 支持 pdflatex、xelatex、lualatex、latexmk
- 📁 **项目管理** - 多项目支持，ZIP 导入/导出
- 📤 **文件上传** - 支持上传图片、代码等资源文件
- 💬 **团队聊天** - 内置聊天功能，方便团队沟通

### 🏗️ 架构

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│  浏览器客户端    │◄───►│   WebTeX 服务器  │◄───►│  本地编译客户端  │
│  (编辑器界面)    │     │   (协作服务)     │     │  (LaTeX 编译)   │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
     :3000                   :3000                   :8088
```

- **服务器端 (server/)**: 处理用户协作、项目管理、文件存储
- **本地编译客户端 (local-compiler/)**: 本地运行，调用系统 LaTeX 进行编译

### 📦 安装

#### 前置要求

- Node.js >= 16.0.0
- LaTeX 发行版 (任选其一):
  - [MiKTeX](https://miktex.org/) (Windows 推荐)
  - [TeX Live](https://www.tug.org/texlive/) (Linux/macOS 推荐)
  - [MacTeX](https://www.tug.org/mactex/) (macOS)

#### 安装步骤

1. **克隆仓库**
```bash
git clone https://github.com/yourusername/webtex.git
cd webtex
```

2. **安装服务器依赖**
```bash
npm install
```

3. **安装本地编译客户端依赖**
```bash
cd local-compiler
npm install
cd ..
```

### 🚀 启动

#### 方式一：使用启动脚本

**Windows:**
```cmd
start.bat
```

**Linux/macOS:**
```bash
chmod +x start.sh
./start.sh
```

#### 方式二：手动启动

1. **启动服务器** (终端 1)
```bash
npm start
```

2. **启动本地编译客户端** (终端 2)
```bash
cd local-compiler
npm start
```

3. **访问编辑器**
打开浏览器访问: http://localhost:3000

### 📖 使用说明

1. 访问 http://localhost:3000/home 进入项目主页
2. 创建新项目或导入现有 ZIP 项目
3. 输入用户名加入项目
4. 开始编辑 LaTeX 文档
5. 点击「编译」或按 `Ctrl+S` 生成 PDF

### ⚙️ 配置

#### 环境变量

复制 `.env.example` 为 `.env` 并修改:

```bash
cp .env.example .env
```

| 变量 | 默认值 | 说明 |
|------|--------|------|
| PORT | 3000 | 服务器端口 |
| COMPILER_PORT | 8088 | 编译服务端口 |

---

## English

### ✨ Features

- 🔄 **Real-time Collaboration** - Multiple users editing simultaneously with cursor synchronization
- 📝 **Syntax Highlighting** - CodeMirror-based LaTeX syntax highlighting
- 🖥️ **Local Compilation** - Uses your local LaTeX installation (MiKTeX/TeX Live)
- 📄 **PDF Preview** - Instant PDF preview in browser after compilation
- 🔧 **Multiple Compilers** - Support for pdflatex, xelatex, lualatex, latexmk
- 📁 **Project Management** - Multiple projects, ZIP import/export
- 📤 **File Upload** - Upload images, code, and other resources
- 💬 **Team Chat** - Built-in chat for team communication

### 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│  Browser Client │◄───►│  WebTeX Server  │◄───►│  Local Compiler │
│  (Editor UI)    │     │  (Collaboration)│     │  (LaTeX Build)  │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
     :3000                   :3000                   :8088
```

### 📦 Installation

#### Prerequisites

- Node.js >= 16.0.0
- LaTeX distribution (one of):
  - [MiKTeX](https://miktex.org/) (Recommended for Windows)
  - [TeX Live](https://www.tug.org/texlive/) (Recommended for Linux/macOS)
  - [MacTeX](https://www.tug.org/mactex/) (macOS)

#### Install

```bash
# Clone repository
git clone https://github.com/yourusername/webtex.git
cd webtex

# Install server dependencies
npm install

# Install local compiler dependencies
cd local-compiler
npm install
```

### 🚀 Quick Start

**Windows:**
```cmd
start.bat
```

**Linux/macOS:**
```bash
./start.sh
```

Then open http://localhost:3000 in your browser.

### 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

<p align="center">Made with ❤️ for the LaTeX community</p>
