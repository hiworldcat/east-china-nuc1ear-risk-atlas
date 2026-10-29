# 把本项目推到你的 Git 仓库

当前项目约 **40 MB**，最大单文件约 **9.4 MB**，直接推 GitHub / Gitee 都可以，不需要 Git LFS。

> 当前目录还不是 Git 仓库，而且这台机器上还没有安装 Git。先完成第 0 步。

## 0. 安装 Git（Windows）

在 PowerShell 里执行：

```powershell
winget install --id Git.Git -e --source winget
```

安装完成后**关闭并重新打开 PowerShell**，确认：

```powershell
git --version
```

如果 winget 不可用，也可以从 [git-scm.com](https://git-scm.com/download/win) 下载安装。

首次使用配置身份：

```powershell
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
```

## 1. 在 GitHub / Gitee 新建空仓库

- 仓库名例如：`east-china-nuclear-risk-atlas`
- **不要**勾选“Add a README file”“Add .gitignore”“Choose a license”
- 创建后复制仓库地址：
  - HTTPS：`https://github.com/<你的用户名>/<仓库名>.git`
  - SSH：`git@github.com:<你的用户名>/<仓库名>.git`

## 2. 只上传某个文件或文件夹

Git 的流程是三步：**选择文件（add）→ 本地提交（commit）→ 上传（push）**。

```powershell
# 只添加一个文件
git add index.html

# 只添加一个文件夹（会包含文件夹下所有未被忽略的文件）
git add assets/

# 添加多个指定文件
git add assets/app.js assets/app.css data/database.js

# 中文文件名要加引号
git add "启动地图.cmd"

# 添加当前目录下所有新增和修改（不处理删除）
git add .

# 添加所有变化，包括删除
git add -A
```

添加后先检查：

```powershell
git status
git diff --cached --stat
```

确认无误再提交：

```powershell
git commit -m "feat: 添加地图前端与数据"
```

最后上传：

```powershell
git push -u origin main
```

### 文件夹是空的？

Git **不跟踪空文件夹**。如果必须保留空目录，在目录里放一个占位文件：

```powershell
New-Item -ItemType File -Path "some-folder/.gitkeep"
git add some-folder/.gitkeep
```

### 文件已经被 .gitignore 忽略，但仍想上传

```powershell
git add -f path/to/file
```

### 已经提交过的文件，想停止跟踪

```powershell
git rm --cached path/to/file
git commit -m "chore: 停止跟踪该文件"
```

## 3. 在项目目录初始化并提交

在 PowerShell 中执行（注意路径有中文，必须加引号）：

```powershell
cd "C:\哔站账号管理-爱吃三文鱼的\视频素材\核战生存地图"

git init -b main
git add .
git commit -m "feat: 华东核战风险地图 v1.1（水系/路网/化工工厂）"
```

确认提交内容：

```powershell
git status
git log --oneline -1
```

## 4. 关联远程仓库并推送

把下面的地址换成你自己的仓库地址：

```powershell
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

如果使用 SSH：

```powershell
git remote add origin git@github.com:<你的用户名>/<仓库名>.git
git push -u origin main
```

## 5. 认证方式

### HTTPS + Personal Access Token

GitHub 已不接受账号密码。到 **GitHub → Settings → Developer settings → Personal access tokens** 创建 token（至少勾选 `repo`），推送时：

- 用户名：你的 GitHub 用户名
- 密码：粘贴 **token**（不是登录密码）

Windows 安装 Git 时通常自带 Git Credential Manager，第一次推送会弹窗登录，按提示授权即可。

### SSH（推荐长期使用）

```powershell
ssh-keygen -t ed25519 -C "你的邮箱"
Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub" | Set-Clipboard
```

把剪贴板里的公钥加到 **GitHub → Settings → SSH and GPG keys → New SSH key**，然后：

```powershell
ssh -T git@github.com
git remote set-url origin git@github.com:<你的用户名>/<仓库名>.git
git push -u origin main
```

## 常见问题

### `git: 无法将“git”项识别为...`

Git 没装好或没进 PATH。重新打开 PowerShell；仍不行就重装 Git，勾选“Git from the command line”。

### `src refspec main does not match any`

当前分支可能叫 `master`：

```powershell
git branch -M main
git push -u origin main
```

### `failed to push some refs` / `non-fast-forward`

远程仓库里已有 README 等文件。两种处理：

**推荐**：删掉远程仓库，重新建一个空仓库再推。

或者合并后再推：

```powershell
git pull --rebase origin main --allow-unrelated-histories
git push -u origin main
```

### `remote origin already exists`

```powershell
git remote set-url origin https://github.com/<你的用户名>/<仓库名>.git
```

### 推送很慢或失败

- 国内访问 GitHub 不稳定时，可先用 Gitee 建仓库，步骤完全一样，只是地址换成 `https://gitee.com/<用户名>/<仓库名>.git`。
- 40 MB 不需要 LFS；如果以后加入大文件，再考虑 Git LFS。

### 想忽略原始数据，只推代码和成品

当前 `.gitignore` 没有排除 `data/raw/`，因为保留原始数据便于复现。  
如果只想推成品，可在 `.gitignore` 增加：

```gitignore
data/raw/
```

然后重新 `git add . && git commit`。

## 一条龙命令（复制即用）

```powershell
cd "C:\哔站账号管理-爱吃三文鱼的\视频素材\核战生存地图"
git init -b main
git add .
git commit -m "feat: 华东核战风险地图 v1.1（水系/路网/化工工厂）"
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

把 `<你的用户名>` 和 `<仓库名>` 替换掉即可。
