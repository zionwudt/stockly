# 简仓 MVP

简仓是一套面向小团队的进销存管理系统 MVP，目标不是一次性把 ERP 做满，而是先把最核心的业务闭环跑通:

- 商品档案维护
- 供应商与客户维护
- 采购入库
- 销售出库
- 库存调整
- 库存总览、低库存预警、最近流水

这版技术实现遵循题设约束:

- 后端: Python
- 前端: 单 HTML 入口 + ES Modules
- 存储: SQLite
- 运行时依赖: 标准库即可运行，无需第三方包

## Python 项目约定

虽然当前版本没有第三方依赖，但项目仍然提供标准的 Python 工程元信息:

- 使用 `pyproject.toml` 描述项目
- 推荐使用仓库根目录下的 `.venv` 作为本地虚拟环境
- 测试时可通过 `pip install -e ".[test]"` 安装 `pytest`
- `.venv/` 不纳入 Git 版本控制

## MVP 设计边界

### 目标用户

- 10 人以内的小团队
- SKU 数量有限，但需要实时知道可售库存
- 先需要一套能落地的出入库工作台，再逐步增加权限、审批、报表

### 业务范围

MVP 只覆盖最核心的“进、销、存”主流程:

1. 建商品
2. 建供应商 / 客户
3. 录采购入库单，库存增加
4. 录销售出库单，库存减少
5. 做库存调整，处理盘盈盘亏
6. 在首页看到库存金额、预警商品、最近单据和库存流水

### 暂不纳入 MVP

- 多仓库调拨
- 采购审批 / 销售审批
- 权限与角色体系
- 财务对账、应收应付账龄
- 条码打印、批次/序列号
- 报表导出

## 项目结构

```text
src/
  backend/
    app.py                # HTTP 服务入口，负责 API 和静态文件托管
    jiancang/
      db.py               # SQLite 建表与初始化数据
      services.py         # 领域服务，处理库存业务规则
  web/
    index.html            # 单页面入口
    styles.css            # 页面样式
    js/
      api.js              # API 请求封装
      ui.js               # 页面渲染与交互 UI
      main.js             # 应用启动与表单提交
```

## 数据模型

核心表设计如下:

- `products`
  - 商品档案，包含 SKU、名称、分类、单位、采购价、销售价、安全库存
- `partners`
  - 往来单位，`partner_type` 区分 `supplier` / `customer`
- `documents`
  - 单据头，`doc_type` 区分 `purchase` / `sale` / `adjustment`
- `document_items`
  - 单据明细
- `stock_movements`
  - 库存流水，所有库存变化都落在这里

当前库存通过 `stock_movements` 汇总得出，这是 MVP 阶段最简单可靠的方式。

## API 概览

### 查询

- `GET /api/summary`
- `GET /api/products`
- `GET /api/suppliers`
- `GET /api/customers`
- `GET /api/stock`
- `GET /api/movements?limit=30`

### 写入

- `POST /api/products`
- `POST /api/suppliers`
- `POST /api/customers`
- `POST /api/purchases`
- `POST /api/sales`
- `POST /api/adjustments`

## 运行方式

推荐先创建并激活虚拟环境:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
```

如果你希望按标准 Python 项目方式安装本项目，也可以执行:

```bash
pip install -e .
```

如果你要运行测试，安装测试依赖并执行:

```bash
pip install -e ".[test]"
pytest
```

然后启动服务:

```bash
jiancang
```

或者:

```bash
python src/backend/app.py
```

默认启动地址:

```text
http://127.0.0.1:8000
```

也可以指定端口和数据库路径:

```bash
python src/backend/app.py --port 9000 --db ./data/dev.db
```

首次启动会自动:

- 创建 SQLite 表
- 写入一批初始化商品和供应商/客户
- 生成一张初始化采购入库单，便于直接查看界面效果

## 当前业务规则

- SKU 唯一
- 单据内不允许重复商品
- 销售出库前会校验库存是否足够
- 库存调整不允许把库存改成负数
- 低于或等于安全库存的商品会进入预警区

## 下一步建议

如果继续把简仓往可商用方向推进，建议按这个顺序扩展:

1. 增加多仓库能力，把库存维度从“商品”扩成“商品 + 仓库”
2. 增加登录、角色和操作日志
3. 增加采购单 / 销售单状态流转
4. 增加基础报表和导出
5. 扩展测试覆盖并接入持续集成
