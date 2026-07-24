# WebUI 二级菜单间距规范

Dialog 和 Popover 形式的二级菜单统一使用以下垂直节奏：

| 位置 | 间距 |
| --- | --- |
| 标题与说明 | 4px |
| 标题区与正文 | 8px |
| 标签与表单控件 | 8px |
| 独立字段或内容分组 | 16px |
| 操作按钮之间 | 8px |

实现约束：

- Dialog 标题区使用 `DialogHeader`，操作区使用 `DialogFooter`。
- 表单容器使用 `.webqq-secondary-form`。
- 标签与控件组成的字段使用 `.webqq-secondary-field`。
- 间距令牌统一维护在 `client/styles/webqq-overlays.css`，页面不得为相同结构另写一套间距。
