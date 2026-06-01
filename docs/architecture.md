# 技术架构

## 技术选型

| 层次 | 选型 | 说明 |
|---|---|---|
| 框架 | [React 18](https://react.dev/) + TypeScript | 组件化 UI，类型安全 |
| 构建工具 | [Vite](https://vitejs.dev/) | 极速开发服务器，零配置 TS 支持 |
| PDF 读取渲染 | [pdfjs-dist](https://mozilla.github.io/pdf.js/) | 渲染 PDF 页面为 Canvas（预览 + 内容提取） |
| PDF 创建/合并 | [pdf-lib](https://pdf-lib.js.org/) | 纯 JS，创建新 PDF 并嵌入页面 |
| OFD 支持 | [ofd.js](https://github.com/DLtech/ofd.js) | 解析 OFD → Canvas，再嵌入为图片 |
| 拖拽排序 | [@dnd-kit/core](https://dndkit.com/) | 现代无障碍拖拽库 |
| 全局状态 | [Zustand](https://zustand-demo.pmnd.rs/) | 轻量级状态管理 |
| 样式 | [Tailwind CSS](https://tailwindcss.com/) | 快速原子化样式 |
| 文件下载 | 原生 `URL.createObjectURL` | 无需额外库 |

> **OFD 处理策略**：OFD → Canvas（接受矢量性损失）→ 以 PNG 图片嵌入 PDF，确保不损伤原图内容，高 DPI 渲染（2×）保证清晰度。

---

## 目录结构

```
reprinter/
├── docs/                        # 仓库级知识（守则、架构、更新记录）
│   ├── REPO-RULES.md
│   ├── README.md
│   ├── architecture.md          # 本文件
│   └── updates/
├── example/                     # 参考示例
│   ├── in.pdf                   # 发票原件（595×409pt，A4宽×约半A4高）
│   └── out.pdf                  # 期望输出（同发票垂直居中于A4页面）
├── public/
│   └── pdf.worker.min.mjs       # PDF.js worker（Vite 静态资源）
├── src/
│   ├── main.tsx                 # React 入口
│   ├── App.tsx                  # 根组件（布局框架）
│   ├── types.ts                 # 共享类型定义
│   ├── components/
│   │   ├── DropZone.tsx         # 拖拽上传区域
│   │   ├── FileList.tsx         # 可排序文件列表（dnd-kit SortableContext）
│   │   ├── FileCard.tsx         # 单个文件卡片（预览图+设置）
│   │   ├── PreviewModal.tsx     # 合并效果预览弹窗（canvas 轮播）
│   │   └── BuildButton.tsx      # 生成并下载按钮 + 进度状态
│   ├── store/
│   │   └── useFileStore.ts      # Zustand 全局状态
│   └── lib/
│       ├── detector.ts          # 文件类型自动检测
│       ├── builder.ts           # 合并输出（核心算法）
│       └── processors/
│           ├── pdfProcessor.ts  # PDF → pdf-lib 页面
│           ├── imageProcessor.ts# JPG/PNG/WebP/BMP → pdf-lib 页面
│           └── ofdProcessor.ts  # OFD → Canvas → pdf-lib 图片页面
├── index.html
├── vite.config.ts
├── tailwind.config.ts
└── package.json
```

---

## 状态模型（Zustand store）

```ts
interface FileEntry {
  id: string;            // nanoid 唯一 ID
  file: File;            // 原始 File 对象
  name: string;          // 文件名
  ext: string;           // 扩展名（pdf/ofd/jpg/png 等）
  isInvoice: boolean;    // 用户最终确认值（初始等于 autoDetected）
  autoDetected: boolean; // 自动检测结果（显示在复选框旁作提示）
  copies: number;        // 复制份数（默认 1，最小 1）
  previewUrl: string;    // 首页预览图 Data URL
  status: 'loading' | 'ready' | 'error';
  errorMsg?: string;
}

interface Settings {
  outputFileName: string;  // 默认 'merged.pdf'
}

interface FileStore {
  files: FileEntry[];
  settings: Settings;
  addFiles(files: File[]): Promise<void>;
  removeFile(id: string): void;
  reorderFiles(oldIndex: number, newIndex: number): void;
  updateFile(id: string, patch: Partial<FileEntry>): void;
  updateSettings(patch: Partial<Settings>): void;
  clearAll(): void;
}
```

---

## 自动检测逻辑（`detector.ts`）

检测优先级（由高到低）：

| 优先级 | 条件 | 结论 |
|---|---|---|
| 1 | 扩展名 `.ofd` | 发票 |
| 2 | 文件名含"发票"、"invoice"、"fapiao"（不区分大小写） | 发票 |
| 3 | PDF 首页文字含"发票代码"、"统一社会信用代码"、"纳税人识别号" | 发票 |
| 4 | 默认 | 非发票 |

---

## 处理器接口（`processors/`）

```ts
export interface EmbeddedPageData {
  type: 'embedded';
  embeddedPage: PDFEmbeddedPage;
  width: number;
  height: number;
}

export interface RasterPageData {
  type: 'raster';
  imageBytes: Uint8Array;
  mimeType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
}

export type ProcessedPage = EmbeddedPageData | RasterPageData;

export async function processFile(
  entry: FileEntry,
  pdfDoc: PDFDocument
): Promise<ProcessedPage[]>
```

---

## 合并输出算法（`builder.ts`）

```
1. 创建空 PDFDocument
2. 按 store.files 顺序迭代每个 FileEntry
3. 调用对应 processor 获得 ProcessedPage[]
4. 循环 copies 次，每次对每个 ProcessedPage：
   a. 若 isInvoice = true → 新建 A4 空白页，执行发票居中变换后追加
   b. 若 isInvoice = false → 直接复制页面追加（保持原始尺寸）
5. 序列化 → Uint8Array → Blob → 触发浏览器下载
```

---

## 发票居中布局算法

依据 `example/in.pdf`（595×409pt）→ `example/out.pdf`（A4，内容垂直居中）推导。

```
A4 目标页面：W = 595.28pt，H = 841.89pt

输入：源页面尺寸 srcW × srcH（pt）

步骤：
  1. 等比缩放以适应 A4（不超出任一边）
     scaleX = W / srcW
     scaleY = H / srcH
     scale  = min(scaleX, scaleY)

  2. 计算缩放后内容尺寸
     fitW = srcW * scale
     fitH = srcH * scale

  3. 垂直水平居中偏移（pdf-lib 坐标原点在左下角）
     offsetX = (W - fitW) / 2
     offsetY = (H - fitH) / 2

  4. 在目标 A4 页面上嵌入源页面
     page.drawPage(embeddedPage, {
       x: offsetX, y: offsetY,
       width: fitW, height: fitH
     })
```

实测对照：`in.pdf`（595×409pt），scale = min(1.0, 2.059) = 1.0，内容原尺寸，
上下各留 (841.89−409)/2 ≈ 216pt（76mm）。`out.pdf` 实测留白约 244pt 上、237pt 下，
差异来自原文件生成工具的轻微偏移，本工具以数学精确居中为准。

---

## UI 交互设计

### 主界面布局

```
+------------------------------------------+
|  标题 + 输出文件名设置                     |
+------------------------------------------+
|  DropZone（拖拽区，可多次追加文件）         |
+------------------------------------------+
|  FileList（可拖拽排序）                    |
|  +--------------------------------------+ |
|  | = [预览图]  文件名                    | |
|  |           [☑ 发票文件 · 自动识别]    | |
|  |           份数: [_1_]  [x删除]       | |
|  +--------------------------------------+ |
+------------------------------------------+
|  [预览合并效果]      [生成并下载 PDF]      |
+------------------------------------------+
```

### FileCard 交互规则

- 加载中：显示 spinner + 文件名
- 自动检测为发票：复选框默认勾选，旁边显示"自动识别"徽标（可取消勾选覆盖）
- 自动检测为非发票：复选框默认未勾选（可手动勾选）
- 预览图点击：全屏查看原文件首页
- 份数：数字输入框，范围 1-99

### 预览 Modal

- 显示所有输出页面的缩略图（按顺序，已乘以份数）
- 发票页面在预览中用灰色 A4 背景框展示居中效果
- 可逐页翻看或缩略图网格浏览

---

## 浏览器兼容性目标

- Chrome / Edge 最新版（主要目标）
- Firefox 最新版
- 不支持 IE / 旧版 Safari

---

## 已知限制

| 限制 | 说明 |
|---|---|
| OFD 矢量 | OFD 经 Canvas 光栅化后嵌入，不保留矢量性；2× DPI 渲染缓解清晰度问题 |
| PDF 加密 | 加密 PDF 需用户先解密，本工具不处理密码 |
| 大文件性能 | 纯前端处理，超大 PDF（>50MB）可能导致浏览器内存压力 |
| 跨域字体 | 部分 PDF 内嵌字体在 Canvas 渲染时可能显示缺字（影响预览，不影响 PDF 内嵌） |
