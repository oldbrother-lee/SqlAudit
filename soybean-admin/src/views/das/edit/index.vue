<script setup lang="ts">
import { ref, computed, onMounted, nextTick, onUnmounted, h, watch, resolveComponent } from 'vue';
import { useI18n } from 'vue-i18n';
import { format } from 'sql-formatter';
import { fetchExecuteMySQLQuery, fetchExecuteClickHouseQuery, fetchSchemas, fetchTables, fetchUserGrants, fetchDBDict, fetchTableInfo } from '@/service/api/das';
import TableColumnSetting from '@/components/advanced/table-column-setting.vue';
import TableHeaderOperation from '@/components/advanced/table-header-operation.vue';
// CodeMirror 6 imports
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { sql } from '@codemirror/lang-sql';
import { foldGutter, foldKeymap, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { useRouter } from 'vue-router';
// 使用普通textarea

const { t } = useI18n();

// 响应式数据
const showLeftPanel = ref(true);
const selectedSchema = ref<any>({});
const activeKey = ref('1');
const newTabIndex = ref(2);
const tabCompletion = ref<any>({});
// 改用网格布局管理左右区域占比
const rightSpan = computed(() => (showLeftPanel.value ? 17 : 24));

// 左侧数据
const schemas = ref<any[]>([]);
const bindTitle = ref('');
const showSearch = ref(false);
const treeLoading = ref(false);
const treeData = ref<any[]>([]);
const searchTreeData = ref<any[]>([]);
const refreshLoading = ref(false);
const tableInfoVisible = ref(false);
const selectedKeys = ref<any>({});
const leftTableSearch = ref('');
// 新增：追踪树展开的键集合 & 列分组展开集合
const expandedKeys = ref<any[]>([]);
const columnsGroupExpanded = ref<Set<string | number>>(new Set());

// 路由跳转：收藏SQL、历史查询
const router = useRouter();
const gotoFavorite = () => router.push({ name: 'das_favorite' });
const gotoHistory = () => router.push({ name: 'das_history' });

// 过滤后的树数据
const filteredTreeData = computed(() => {
  const kw = leftTableSearch.value.trim().toLowerCase();
  if (!kw || searchTreeData.value.length === 0) return treeData.value;
  return treeData.value.filter((node: any) => {
    const title = (node.label || node.title || '').toLowerCase();
    return title.includes(kw);
  });
});

// 自定义左侧 NTree 节点渲染：左侧字段名，右侧类型/列数
const renderTreeLabel = ({ option }: { option: any }) => {
  const SvgIcon = resolveComponent('SvgIcon') as any;
  const label = option.label || '';

  // 叶子节点：列
  if (option.isLeaf) {
    // 兼容两种排列：
    // 1) 列名 类型    2) 类型 列名
    const parts = String(label).split(/\s+/).filter(Boolean);
    let name = label;
    let type = '';
    if (parts.length > 1) {
      const first = parts[0];
      const rest = parts.slice(1).join(' ');
      const typeKeywords = [
        'varchar', 'char', 'text', 'longtext', 'mediumtext', 'tinytext', 'int', 'bigint', 'smallint', 'tinyint',
        'decimal', 'double', 'float', 'datetime', 'timestamp', 'date', 'time', 'json'
      ];
      const isTypeFirst = /\)/.test(first) || typeKeywords.some(k => first.toLowerCase().startsWith(k));
      if (isTypeFirst) {
        type = first;
        name = rest;
      } else {
        name = first;
        type = rest;
      }
    }
    return h(
      'span',
      { class: 'das-tree-item' },
      [
        h('span', { class: 'das-tree-item-left' }, [
          h(SvgIcon, { icon: 'carbon:list', class: 'mr-6px text-14px text-info' }),
          h('span', { class: 'das-tree-item-name' }, name)
        ]),
        h('span', { class: 'das-tree-item-type' }, type)
      ]
    );
  }

  // 表节点：仅在展开时显示第二行“列(数量)”并可开关
  const count = Array.isArray(option.children) ? option.children.length : 0;
  const isNodeExpanded = expandedKeys.value?.includes?.(option.key);
  const groupOpened = columnsGroupExpanded.value.has(option.key);
  return h(
    'span',
    { class: 'das-tree-item das-tree-item-table' },
    [
      // 第一行：图标 + 表名
      h('span', { class: 'das-tree-item-left' }, [
        h(SvgIcon, { icon: 'mdi:table', class: 'text-14px text-info' }),
        h('span', { class: 'das-tree-item-name' }, label)
      ]),
      // 第二行：仅在展开时显示“列(数量)”且可独立展开/收起列清单
      isNodeExpanded && count ? h('span', { class: 'das-tree-item-meta-row' }, [
        h(
          'span',
          {
            class: 'das-tree-item-count das-tree-item-count-toggle',
            onClick: (e: MouseEvent) => { e.stopPropagation(); toggleColumnsGroup(option.key); }
          },
          [
            h(SvgIcon, { icon: groupOpened ? 'carbon:chevron-down' : 'carbon:chevron-right', class: 'mr-2px text-14px' }),
            `列(${count})`
          ]
        )
      ]) : null
    ]
  );
};

// 自定义展开/折叠图标为更常见的箭头（右/下），并禁用默认旋转
const renderSwitcherIcon = ({ expanded }: { expanded: boolean }) => {
  const SvgIcon = resolveComponent('SvgIcon') as any;
  return h(
    SvgIcon,
    { icon: expanded ? 'carbon:chevron-down' : 'carbon:chevron-right', class: 'das-tree-switcher-icon', style: 'transform: none' }
  );
};

// 新增：切换表节点下“列”分组展开/收起
function toggleColumnsGroup(key: string | number) {
  if (columnsGroupExpanded.value.has(key)) {
    columnsGroupExpanded.value.delete(key);
  } else {
    columnsGroupExpanded.value.add(key);
  }
}

// 新增：按开关过滤子节点返回（仅当分组展开时返回列）
function getNodeChildren(option: any) {
  if (!option) return [];
  // 叶子节点原样返回（通常无 children）
  if (option.isLeaf) return option.children || [];
  // 表节点：只有当该表的“列”分组被打开时才返回列清单
  const key = option.key;
  if (columnsGroupExpanded.value.has(key)) {
    return option.children || [];
  }
  return [];
}

// 标签页数据
interface EditorPane {
  title: string;
  key: string;
  closable: boolean;
  sql: string;
  sessionVars: string;
  characterSet: string;
  theme: string;
  result?: any;
  loading?: boolean;
  responseMsg?: string;
  pagination?: {
    currentPage: number;
    pageSize: number;
    total: number;
  };
}

const panes = ref<EditorPane[]>([
  {
    title: 'SQLConsole',
    key: '1',
    closable: false,
    sql: '',
    sessionVars: '',
    characterSet: 'utf8',
    theme: 'default',
    result: null,
    loading: false,
    responseMsg: '',
    pagination: { currentPage: 1, pageSize: 20, total: 0 }
  }
]);

const defaultPageSize = 20;
const pageSizes = [10, 20, 50, 100];

const tabIndex = computed(() => {
  return panes.value.findIndex((v) => v.key === activeKey.value);
});

const currentPane = computed<EditorPane>(() => panes.value[tabIndex.value] || panes.value[0]);
const currentSchemaLabel = computed(() => {
  if (!selectedSchema.value?.schema) return '未选择库';
  const type = selectedSchema.value?.db_type || 'mysql';
  return `${selectedSchema.value.schema} · ${type}`;
});

// CodeMirror: per-pane editor实例及可重配置主题
const editorViews = ref<Record<string, EditorView | null>>({});
const themeCompartments = ref<Record<string, Compartment>>({});
const languageCompartments = ref<Record<string, Compartment>>({});

function getThemeExtension(theme: string) {
  // 仅在暗色主题时启用 oneDark，其余使用默认浅色
  if (theme === 'vs-dark' || theme === 'hc-black') {
    return oneDark;
  }
  // 浅色主题下启用默认的语法高亮样式
  return [syntaxHighlighting(defaultHighlightStyle, { fallback: true })];
}

function schemaForCompletion(): Record<string, string[]> {
  const tablesMap = (tabCompletion.value?.tables || {}) as Record<string, string[]>;
  return tablesMap;
}

// 额外的表名补全源：在任意位置为词前缀提供表名提示，不覆盖内置来源
function tableNameCompletion(context: any) {
  const before = context.matchBefore(/\w+$/);
  if (!before) return null;
  const tablesMap = (tabCompletion.value?.tables || {}) as Record<string, string[]>;
  const names = Object.keys(tablesMap);
  if (names.length === 0) return null;
  const options = names.map((name) => ({ label: name, type: 'variable', boost: -10 }));
  return { from: before.from, options };
}

function createEditor(pane: EditorPane, el: HTMLElement) {
  // 若该 pane 已创建过编辑器，则避免重复创建以防渲染循环
  if (editorViews.value[pane.key]) return;
  const state = EditorState.create({
    doc: pane.sql || '',
    extensions: [
      lineNumbers(),
      foldGutter(),
      // 语言通过 Compartment 动态配置（便于后续更新 schema）
      (languageCompartments.value[pane.key] = new Compartment()).of(sql({ schema: schemaForCompletion(), upperCaseKeywords: true })),
      // 主题通过 Compartment 动态配置
      (themeCompartments.value[pane.key] = new Compartment()).of(getThemeExtension(pane.theme)),
      history(),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        indentWithTab,
        {
          key: 'Mod-Enter',
          run: () => {
            executeSQL(pane);
            return true;
          }
        }
      ]),
      // 使用默认内置补全来源，并启用输入时触发
      autocompletion({ activateOnTyping: true }),
      // 以语言数据形式注入额外的表名补全源（不会覆盖内置来源）
      EditorState.languageData.of(() => [{ autocomplete: tableNameCompletion }]),
      EditorView.updateListener.of((v) => {
        if (v.docChanged) {
          const text = v.state.doc.toString();
          pane.sql = text;
        }
      })
    ]
  });
  const view = new EditorView({ state, parent: el });
  editorViews.value[pane.key] = view;
}

function setEditorRef(pane: EditorPane, el: HTMLElement | null) {
  if (!el) return;
  const view = editorViews.value[pane.key];
  // 若已存在视图但被卸载，需要重新挂载到当前容器
  if (view) {
    if (view.dom.parentElement !== el) {
      el.innerHTML = '';
      el.appendChild(view.dom);
    }
    return;
  }
  createEditor(pane, el);
}

// keep editor in sync when sql changes externally (e.g., dblclick fill)
watch(
  () => panes.value.map(p => ({ key: p.key, sql: p.sql })),
  (list) => {
    list.forEach(({ key, sql }) => {
      const view = editorViews.value[key];
      if (view) {
        const cur = view.state.doc.toString();
        if (cur !== (sql || '')) {
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: sql || '' }
          });
        }
      }
    });
  }
);

// 当主题改变时动态重新配置主题扩展
watch(
  () => panes.value.map(p => ({ key: p.key, theme: p.theme })),
  (list) => {
    list.forEach(({ key, theme }) => {
      const view = editorViews.value[key];
      const compartment = themeCompartments.value[key];
      if (view && compartment) {
        view.dispatch({ effects: compartment.reconfigure(getThemeExtension(theme)) });
      }
    });
  }
);

// 当表/列信息更新时，动态刷新语言扩展中的 schema，使内置补全即时生效
watch(
  () => tabCompletion.value,
  () => {
    Object.entries(editorViews.value).forEach(([key, view]) => {
      if (!view) return;
      const langComp = languageCompartments.value[key];
      if (!langComp) return;
      view.dispatch({ effects: langComp.reconfigure(sql({ schema: schemaForCompletion(), upperCaseKeywords: true })) });
    });
  },
  { deep: true }
);

// 编辑器实例引用
const editorRefs = ref<Record<string, any>>({});

// 左侧方法
const refreshSchemas = async () => {
  refreshLoading.value = true;
  try {
    await getSchemas();
    window.$message?.info('库列表刷新成功，请展开下拉列表查看');
  } finally {
    refreshLoading.value = false;
  }
};

const onSearch = (value: string) => {
  if (!value) {
    treeData.value = searchTreeData.value;
    return;
  }
  const searchResult = treeData.value.filter((item: any) => {
    const title = item.title || item.label || '';
    return title.indexOf(value) > -1;
  });
  treeData.value = searchResult;
};

const getGrants = async (params: any) => {
  try {
    const { data } = await fetchUserGrants(params);
    return data;
  } catch (error) {
    console.warn('获取权限失败', error);
    return { tables: [] };
  }
};

const getSchemas = async () => {
  try {
    const { data } = await fetchSchemas();
    schemas.value = data || [];
  } catch (error) {
    console.error('加载失败', error);
    window.$message?.error('加载库列表失败');
  }
};

const getTables = async (value: string) => {
  searchTreeData.value = [];
  showSearch.value = true;
  treeLoading.value = true;
  leftTableSearch.value = '';
  
  const vals = value.split('#');
  selectedSchema.value = {
    instance_id: vals[0],
    schema: vals[1],
    db_type: vals[2]
  };
  
  const params = {
    instance_id: vals[0],
    schema: vals[1]
  };
  
  try {
    const { data } = await fetchTables(params);
    if (data) {
      const grants = await getGrants(selectedSchema.value);
      renderTree(grants, data);
    }
  } catch (error: any) {
    window.$message?.error(error?.message || '加载失败');
  } finally {
    treeLoading.value = false;
  }
};

// 刷新当前库的表列表（不改变已选择的库）
const refreshTables = async () => {
  if (!selectedSchema.value?.instance_id || !selectedSchema.value?.schema) {
    window.$message?.warning('请先选择左侧的库');
    return;
  }
  treeLoading.value = true;
  try {
    const { data } = await fetchTables({
      instance_id: selectedSchema.value.instance_id,
      schema: selectedSchema.value.schema
    });
    if (data) {
      const grants = await getGrants(selectedSchema.value);
      renderTree(grants, data);
      window.$message?.success('表列表已刷新');
    }
  } catch (error: any) {
    window.$message?.error(error?.message || '刷新失败');
  } finally {
    treeLoading.value = false;
  }
};

const checkTableRule = (grants: any, table: string) => {
  if (grants?.tables?.length === 1 && grants.tables === '*') {
    return true;
  }
  if (!grants?.tables || !Array.isArray(grants.tables)) {
    return true;
  }
  
  let hasAllow = false;
  if (grants.tables[0]?.['rule'] === 'allow') {
    hasAllow = true;
  }
  
  if (hasAllow) {
    for (const v of grants.tables) {
      if (v['rule'] === 'allow' && v['table'] === table) {
        return true;
      }
    }
    return false;
  } else {
    for (const v of grants.tables) {
      if (v['rule'] === 'deny' && v['table'] === table) {
        return false;
      }
    }
    return true;
  }
};

const renderTree = (grants: any, data: any[]) => {
  const tmpTreeData: any[] = [];
  const tmpTabCompletion: any = { tables: {} };
  
  data.forEach((row: any) => {
    const tmpColumnsData: any[] = [];
    const columnsCompletion: string[] = [];
    
    // 解析列信息
    const columnsStr = row.columns || '';
    const columns = columnsStr.split('@@');
    
    columns.forEach((v: string) => {
      if (!v) return;
      const colName = v.split('$$')[0];
      tmpColumnsData.push({
        title: v.replaceAll('$$', ' '),
        label: v.replaceAll('$$', ' '),
        key: `${row['table_schema']}#${row['table_name']}#${colName}`,
        isLeaf: true
      });
      columnsCompletion.push(colName);
    });
    
    // 检查表权限
    const rule = checkTableRule(grants, row.table_name) ? 'allow' : 'deny';
    const remark = row.table_comment ? ` (${row.table_comment})` : '';
    
    tmpTreeData.push({
      title: `${row.table_name}${remark}`,
      label: `${row.table_name}${remark}`,
      key: `${row['table_schema']}#${row['table_name']}`,
      rule,
      children: tmpColumnsData
    });
    
    tmpTabCompletion['tables'][row['table_name']] = columnsCompletion;
  });
  
  treeData.value = tmpTreeData;
  searchTreeData.value = [...tmpTreeData];
  tabCompletion.value = tmpTabCompletion;
  // 默认将每个表的“列”分组设为展开
  columnsGroupExpanded.value = new Set(tmpTreeData.map((n: any) => n.key));
};

// 右侧编辑器方法
const foldLeft = () => {
  showLeftPanel.value = !showLeftPanel.value;
};

const onEdit = (targetKey: string, action: 'add' | 'remove') => {
  if (action === 'add') {
    add();
  } else {
    remove(targetKey);
  }
};

const add = () => {
  const activeKeyValue = newTabIndex.value++;
  panes.value.push({
    title: `SQLConsole ${activeKeyValue}`,
    key: activeKeyValue.toString(),
    closable: true,
    sql: loadCodeFromCache(`dms-codemirror-${activeKeyValue}`),
    sessionVars: '',
    characterSet: 'utf8',
    theme: 'default',
    result: null,
    loading: false,
    responseMsg: '',
    pagination: { currentPage: 1, pageSize: defaultPageSize, total: 0 }
  });
  activeKey.value = activeKeyValue.toString();
};

const remove = (targetKey: string) => {
  // 销毁对应的编辑器实例，避免残留引用导致重新挂载失败
  const view = editorViews.value[targetKey];
  if (view) {
    view.destroy();
    delete editorViews.value[targetKey];
    delete themeCompartments.value[targetKey];
    delete languageCompartments.value[targetKey];
  }

  let activeKeyValue = activeKey.value;
  let lastIndex = -1;
  
  panes.value.forEach((pane, i) => {
    if (pane.key === targetKey) {
      lastIndex = i - 1;
    }
  });
  
  const newPanes = panes.value.filter((pane) => pane.key !== targetKey);
  
  if (newPanes.length && activeKeyValue === targetKey) {
    if (lastIndex >= 0) {
      activeKeyValue = newPanes[lastIndex].key;
    } else {
      activeKeyValue = newPanes[0].key;
    }
  }
  
  panes.value = newPanes;
  activeKey.value = activeKeyValue;
};

const changeTab = () => {
  nextTick(() => {
    console.log('Tab changed to:', activeKey.value);
  });
};

// SQL执行
const parseSessionVars = (pane: EditorPane) => {
  const sessionVars: any = {};
  if (pane.sessionVars && pane.sessionVars.length > 0) {
    pane.sessionVars.split(';').forEach((v: string) => {
      const sessionVar = v.split('=');
      if (sessionVar.length === 2) {
        sessionVars[sessionVar[0].trim()] = sessionVar[1].trim();
      }
    });
  }
  return sessionVars;
};

const executeMySQLQuery = async (pane: EditorPane, data: any) => {
  const characterSet = {
    character_set_client: pane.characterSet,
    character_set_connection: pane.characterSet,
    character_set_results: pane.characterSet
  };
  
  data['params'] = { ...characterSet, ...parseSessionVars(pane) };
  
  const resMsgs: string[] = [];
  pane.loading = true;
  
  try {
    const response = await fetchExecuteMySQLQuery(data);
    const respData = response.data as any;
    
    resMsgs.push('结果: 执行成功');
    resMsgs.push(`耗时: ${respData?.duration || '-'}`);
    resMsgs.push(`SQL: ${respData?.sqltext || data.sqltext}`);
    resMsgs.push(`请求ID: ${(response as any).request_id || '-'}`);
    
    // 适配后端返回的数据格式
    if (respData) {
      // 如果返回的data中有data字段（嵌套结构），提取出来
      if (respData.data && Array.isArray(respData.data)) {
        pane.result = {
          columns: respData.columns || [],
          rows: respData.data,
          data: respData.data,
          duration: respData.duration,
          sqltext: respData.sqltext,
          affected_rows: respData.affected_rows,
          affectedRows: respData.affectedRows
        };
      } else {
        pane.result = respData;
      }
    }
    
    pane.responseMsg = resMsgs.join('<br>');
    
    // 更新表格列设置
    updateTableColumnChecks(pane);
    initPagination(pane);
    
    window.$message?.success('执行成功');
  } catch (error: any) {
    resMsgs.push('结果: 执行失败');
    resMsgs.push(`错误: ${error?.message || '未知错误'}`);
    pane.responseMsg = resMsgs.join('<br>');
    pane.result = null;
    
    if (error?.message?.includes('sessionid')) {
      window.$message?.error('执行失败，认证过期，请刷新页面后重新执行');
    } else {
      window.$message?.error('执行失败');
    }
  } finally {
    pane.loading = false;
  }
};

const executeClickHouseQuery = async (pane: EditorPane, data: any) => {
  data['params'] = { ...parseSessionVars(pane) };
  
  const resMsgs: string[] = [];
  pane.loading = true;
  
  try {
    const response = await fetchExecuteClickHouseQuery(data);
    const respData = response.data as any;
    
    resMsgs.push('结果: 执行成功');
    resMsgs.push(`耗时: ${respData?.duration || '-'}`);
    resMsgs.push(`SQL: ${respData?.sqltext || data.sqltext}`);
    resMsgs.push(`请求ID: ${(response as any).request_id || '-'}`);
    
    // 适配后端返回的数据格式
    if (respData) {
      // 如果返回的data中有data字段（嵌套结构），提取出来
      if (respData.data && Array.isArray(respData.data)) {
        pane.result = {
          columns: respData.columns || [],
          rows: respData.data,
          data: respData.data,
          duration: respData.duration,
          sqltext: respData.sqltext,
          affected_rows: respData.affected_rows,
          affectedRows: respData.affectedRows
        };
      } else {
        pane.result = respData;
      }
    }
    
    pane.responseMsg = resMsgs.join('<br>');
    
    // 更新表格列设置
    updateTableColumnChecks(pane);
    initPagination(pane);
    
    window.$message?.success('执行成功');
  } catch (error: any) {
    resMsgs.push('结果: 执行失败');
    resMsgs.push(`错误: ${error?.message || '未知错误'}`);
    pane.responseMsg = resMsgs.join('<br>');
    pane.result = null;
    
    if (error?.message?.includes('sessionid')) {
      window.$message?.error('执行失败，认证过期，请刷新页面后重新执行');
    } else {
      window.$message?.error('执行失败');
    }
  } finally {
    pane.loading = false;
  }
};

// 获取选中的 SQL，如果没有选区则返回全文
function getSqlToExecute(p: EditorPane): string {
  const view = editorViews.value[p.key];
  if (view) {
    const ranges = view.state.selection.ranges;
    for (const r of ranges) {
      if (!r.empty) {
        const sel = view.state.sliceDoc(r.from, r.to).trim();
        if (sel.length > 0) return sel;
      }
    }
  }
  return (p.sql || '').trim();
}

const executeSQL = (pane?: EditorPane) => {
  const p = pane || currentPane.value;
  saveCodeToCache(p);

  if (Object.keys(selectedSchema.value).length === 0) {
    window.$message?.warning('请先选择左侧的库');
    return;
  }

  const sqltext = getSqlToExecute(p);
  if (!sqltext || sqltext.length === 0) {
    window.$message?.warning('请输入或选择要执行的SQL');
    return;
  }

  const data = {
    ...selectedSchema.value,
    sqltext
  };

  const dbType = selectedSchema.value['db_type']?.toLowerCase() || 'mysql';
  if (dbType === 'tidb' || dbType === 'mysql') {
    executeMySQLQuery(p, data);
  } else if (dbType === 'clickhouse') {
    executeClickHouseQuery(p, data);
  }
};

const formatSQL = (pane?: EditorPane) => {
  const p = pane || currentPane.value;
  saveCodeToCache(p);
  
  try {
    p.sql = format(p.sql, { language: 'mysql' });
    window.$message?.success('格式化成功');
  } catch (error) {
    window.$message?.warning('格式化失败，请检查SQL语法');
  }
};

const loadDBDictData = async () => {
  if (Object.keys(selectedSchema.value).length === 0) {
    window.$message?.warning('请先选择左侧的库');
    return;
  }
  
  try {
    const { data } = await fetchDBDict({
      instance_id: selectedSchema.value.instance_id,
      schema: selectedSchema.value.schema
    });
    
    // 在新窗口中打开数据字典
    const win = window.open('', '_blank');
    if (win) {
      win.document.write('<h1>数据字典</h1>');
      win.document.write('<pre>' + JSON.stringify(data, null, 2) + '</pre>');
    }
  } catch (error: any) {
    window.$message?.error(error?.message || '加载数据字典失败');
  }
};



// 缓存管理
const saveCodeToCache = (pane: EditorPane) => {
  localStorage.setItem(`dms-codemirror-${pane.key}`, pane.sql);
  localStorage.setItem(`dms-character-${pane.key}`, pane.characterSet);
  localStorage.setItem(`dms-theme-${pane.key}`, pane.theme);
  localStorage.setItem(`dms-sessionvars-${pane.key}`, pane.sessionVars);
};

const loadCodeFromCache = (key: string): string => {
  return localStorage.getItem(key) || '';
};

const loadPaneFromCache = (pane: EditorPane) => {
  pane.sql = loadCodeFromCache(`dms-codemirror-${pane.key}`);
  pane.characterSet = localStorage.getItem(`dms-character-${pane.key}`) || 'utf8';
  pane.theme = localStorage.getItem(`dms-theme-${pane.key}`) || 'default';
  pane.sessionVars = localStorage.getItem(`dms-sessionvars-${pane.key}`) || '';
};

// 表格数据 - 使用项目中的高级表格组件
const getTableColumns = (pane: EditorPane) => {
  const result = pane.result;
  if (!result) {
    console.log('getTableColumns: no result');
    return [];
  }
  
  const columns = result.columns || [];
  console.log('getTableColumns: columns =', columns);
  if (!columns.length) return [];
  
  const tableColumns = columns.map((name: string) => ({ 
    title: name, 
    key: name, 
    ellipsis: { tooltip: true },
    minWidth: 120
  }));
  console.log('getTableColumns: tableColumns =', tableColumns);
  return tableColumns;
};

const getTableData = (pane: EditorPane) => {
  const result = pane.result;
  if (!result) {
    console.log('getTableData: no result');
    return [];
  }
  
  const cols = result.columns || [];
  const rows = result.rows || result.data || [];
  
  console.log('getTableData: cols =', cols);
  console.log('getTableData: rows =', rows);
  console.log('getTableData: result =', result);
  
  if (!cols.length || !rows.length) {
    console.log('getTableData: no cols or rows');
    return [];
  }
  
  // 如果rows中的元素已经是对象（键值对），直接返回
  if (rows.length > 0 && typeof rows[0] === 'object' && !Array.isArray(rows[0])) {
    console.log('getTableData: returning object array');
    return rows;
  }
  
  // 如果rows是二维数组，转换为对象数组
  if (Array.isArray(rows) && rows.length > 0 && Array.isArray(rows[0])) {
    console.log('getTableData: converting 2D array to object array');
    const convertedData = rows.map((row: any[]) => {
    const obj: Record<string, any> = {};
      cols.forEach((col: string, idx: number) => {
        obj[col] = row[idx];
      });
    return obj;
  });
    console.log('getTableData: converted data =', convertedData);
    return convertedData;
  }
  
  console.log('getTableData: returning empty array');
  return [];
};

// 初始化/更新分页统计
const initPagination = (pane: EditorPane) => {
  const total = getTableData(pane).length;
  if (!pane.pagination) {
    pane.pagination = { currentPage: 1, pageSize: defaultPageSize, total };
  } else {
    pane.pagination.total = total;
    const maxPage = Math.max(1, Math.ceil(total / (pane.pagination.pageSize || defaultPageSize)));
    if (pane.pagination.currentPage > maxPage) pane.pagination.currentPage = maxPage;
  }
};

// 按分页切片后的数据
const getPagedTableData = (pane: EditorPane) => {
  const full = getTableData(pane);
  const currentPage = pane.pagination?.currentPage ?? 1;
  const pageSize = pane.pagination?.pageSize ?? defaultPageSize;
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  return full.slice(start, end);
};

// 分页变更事件
const onPageChange = (pane: EditorPane, currentPage: number, pageSize: number) => {
  if (!pane.pagination) {
    pane.pagination = { currentPage, pageSize, total: getTableData(pane).length };
  } else {
    pane.pagination.currentPage = currentPage;
    pane.pagination.pageSize = pageSize;
    pane.pagination.total = getTableData(pane).length;
  }
};

// 表格列设置
const tableColumnChecks = ref<NaiveUI.TableColumnCheck[]>([]);
// 派生勾选映射，便于快速判断列是否显示
const tableColumnCheckMap = computed<Record<string, boolean>>(() => {
  const map: Record<string, boolean> = {};
  tableColumnChecks.value.forEach((c) => {
    map[c.key] = !!c.checked;
  });   
  return map;
});

// 根据勾选状态返回可见列
const getVisibleColumns = (pane: EditorPane) => {
  const columns = getTableColumns(pane);
  return columns.filter((c: any) => tableColumnCheckMap.value[c.key] !== false);
};

// 更新表格列设置（保留已有勾选状态）
const updateTableColumnChecks = (pane: EditorPane) => {
  const columns = getTableColumns(pane);
  const oldMap: Record<string, boolean> = {};
  tableColumnChecks.value.forEach((c) => {
    oldMap[c.key] = !!c.checked;
  });
  tableColumnChecks.value = columns.map((col: any) => ({
    key: col.key as string,
    title: col.title as string,
    checked: Object.prototype.hasOwnProperty.call(oldMap, col.key) ? oldMap[col.key] : true
  }));
};

// 编辑器事件处理
const onEditorChange = (pane: EditorPane, value: string) => {
  pane.sql = value;
  saveCodeToCache(pane);
};

// 已移除拖拽分隔逻辑，使用组件自身布局属性实现

// 树节点点击
const handleNodeClick = (keys: string[], e: any) => {
  console.log('Node clicked:', keys, e);
};

// 树节点双击填充SQL（改为追加，不替换原内容）
const handleNodeDblClick = (key: string) => {
  if (!key) return;
  const parts = key.split('#');
  if (parts.length !== 2) return; // 只对表节点生效
  
  const [schema, table] = parts;
  const p = currentPane.value;
  const dbType = selectedSchema.value['db_type']?.toLowerCase() || 'mysql';
  
  const query = dbType === 'clickhouse'
    ? `SELECT * FROM "${schema}"."${table}" LIMIT 100;`
    : `SELECT * FROM \`${schema}\`.\`${table}\` LIMIT 100;`;
  
  // 追加到现有内容；若为空则直接赋值
  p.sql = p.sql && p.sql.length > 0 ? `${p.sql}\n\n${query}` : query;
};

onMounted(async () => {
  await getSchemas();
  loadPaneFromCache(currentPane.value);
});

onUnmounted(() => {
});
</script>

<template>
  <NCard size="small" class="das-page" :content-style="{ padding: '12px' }">
    <NGrid cols="24" x-gap="12" y-gap="12">
      <NGi v-if="showLeftPanel" span="7">
        <NCard size="small" title="数据库选择" :segmented="{ content: true }" class="das-left-card">
          <template #header-extra>
            <NSpace :size="6">
              <NTooltip trigger="hover" placement="top" :show-arrow="false">
                <template #trigger>
                  <NButton quaternary circle size="small" :loading="refreshLoading" @click="refreshSchemas">
                    <template #icon><SvgIcon icon="carbon:renew" /></template>
                  </NButton>
                </template>
                刷新数据库列表
              </NTooltip>
              <NTooltip trigger="hover" placement="top" :show-arrow="false">
                <template #trigger>
                  <NButton quaternary circle size="small" @click="foldLeft">
                    <template #icon><SvgIcon icon="line-md:menu-fold-left" /></template>
                  </NButton>
                </template>
                折叠左侧面板
              </NTooltip>
            </NSpace>
          </template>
          <NSpace vertical :size="10">
            <NSelect
              v-model:value="bindTitle"
              :options="schemas.map((s: any) => ({
                label: `${s.remark || s.instanceName || s.hostname}:${s.schema}`,
                value: `${s.instance_id}#${s.schema}#${s.db_type}`
              }))"
              filterable
              clearable
              placeholder="请选择库名..."
              @update:value="getTables"
            />
            <NInput
              v-if="showSearch"
              v-model:value="leftTableSearch"
              clearable
              placeholder="输入要搜索的表名..."
              @keyup.enter="onSearch(leftTableSearch)"
            />
            <NText depth="3" class="das-hint">搜索不到需要的表？试试刷新按钮。</NText>
            <NScrollbar class="das-tree-scroll">
              <NSpin :show="treeLoading">
                <NTree
                  :data="filteredTreeData"
                  block-line
                  show-line
                  :virtual-scroll="true"
                  :render-label="renderTreeLabel"
                  :render-switcher-icon="renderSwitcherIcon"
                  :get-children="getNodeChildren"
                  v-model:expanded-keys="expandedKeys"
                  :node-props="(info: any) => ({ onDblclick: () => handleNodeDblClick(info.option.key) })"
                  @update:selected-keys="handleNodeClick"
                />
              </NSpin>
            </NScrollbar>
          </NSpace>
        </NCard>
      </NGi>
      <NGi :span="rightSpan">
        <NSpace vertical :size="12">
          <NCard v-if="!showLeftPanel" size="small" class="das-ghost-card" :bordered="false">
            <NButton quaternary size="small" @click="foldLeft">
              <template #icon><SvgIcon icon="line-md:menu-fold-right" /></template>
              展开数据库面板
            </NButton>
          </NCard>
          <NCard size="small" class="das-editor-shell" :segmented="{ content: true }">
            <template #header>
              <NSpace justify="space-between" align="center" class="das-shell-header">
                <div class="das-title">
                  <span>SQL 工作台</span>
                  <NTag size="small" type="success">{{ currentSchemaLabel }}</NTag>
                </div>
                <NSpace :size="8" wrap>
                  <NButton quaternary size="small" @click="gotoFavorite">
                    <template #icon><SvgIcon icon="carbon:star" /></template>
                    收藏 SQL
                  </NButton>
                  <NButton quaternary size="small" @click="gotoHistory">
                    <template #icon><SvgIcon icon="carbon:time" /></template>
                    历史查询
                  </NButton>
                  <NButton quaternary size="small" @click="loadDBDictData">
                    <template #icon><SvgIcon icon="carbon:document" /></template>
                    数据字典
                  </NButton>
                  <NButton quaternary size="small" @click="refreshTables">
                    <template #icon><SvgIcon icon="carbon:renew" /></template>
                    刷新表
                  </NButton>
                </NSpace>
              </NSpace>
            </template>
            <NTabs
              v-model:value="activeKey"
              type="card"
              size="small"
              addable
              @add="add"
              @close="remove"
              @update:value="changeTab"
            >
              <NTabPane
                v-for="pane in panes"
                :key="pane.key"
                :name="pane.key"
                :tab="pane.title"
                :closable="pane.closable"
              >
                <NSpace vertical :size="12">
                  <NCard size="small" :segmented="{ content: true }" class="das-editor-card">
                    <template #header>
                      <NSpace justify="space-between" align="center">
                        <div class="das-subtitle">
                          <SvgIcon icon="carbon:terminal" class="mr-4px" />
                          SQL 编辑器
                        </div>
                        <NSpace :size="6">
                          <NButton quaternary size="tiny" @click="formatSQL(pane)">
                            <template #icon><SvgIcon icon="carbon:code" /></template>
                            格式化
                          </NButton>
                        </NSpace>
                      </NSpace>
                    </template>
                    <div class="code-editor-container" :ref="(el) => setEditorRef(pane, el as unknown as HTMLElement)" />
                    <div class="das-editor-actions">
                      <NSpace :size="6" wrap>
                        <NButton size="tiny" type="primary" :loading="pane.loading" @click="executeSQL(pane)">
                          <template #icon><SvgIcon icon="carbon:flash" /></template>
                          执行 SQL
                        </NButton>
                        <NButton size="tiny" @click="loadDBDictData">
                          <template #icon><SvgIcon icon="carbon:document" /></template>
                          数据字典
                        </NButton>
                        <NButton size="tiny" @click="gotoFavorite">
                          <template #icon><SvgIcon icon="carbon:star" /></template>
                          收藏 SQL
                        </NButton>
                        <NButton size="tiny" @click="gotoHistory">
                          <template #icon><SvgIcon icon="carbon:time" /></template>
                          历史查询
                        </NButton>
                      </NSpace>
                    </div>
                  </NCard>
                  <NCard size="small" :segmented="{ content: true }" class="das-result-card">
                    <template #header>
                      <NSpace justify="space-between" align="center">
                        <div class="das-subtitle">
                          <SvgIcon icon="carbon:data-base" class="mr-4px" />
                          查询结果
                        </div>
                        <TableColumnSetting v-model:columns="tableColumnChecks" />
                      </NSpace>
                    </template>
                    <div v-if="pane.result">
                      <div v-if="getTableData(pane).length > 0">
                        <vxe-table
                          :data="getPagedTableData(pane)"
                          border
                          stripe
                          :height="400"
                          :column-config="{ resizable: true }"
                          :resizable-config="{ showDragTip: false }"
                          :scroll-y="{ enabled: true }"
                          show-overflow
                        >
                          <vxe-column
                            v-for="col in getVisibleColumns(pane)"
                            :key="col.key"
                            :field="col.key"
                            :title="col.title"
                            :min-width="col.minWidth || 120"
                          />
                        </vxe-table>
                        <div class="das-result-meta">
                          <div class="das-result-stat">
                            <SvgIcon icon="carbon:checkmark" class="text-16px text-#18a058" />
                            <NText type="success">执行成功</NText>
                            <NText>当前返回 [{{ getTableData(pane).length }}] 行</NText>
                            <SvgIcon icon="carbon:time" class="ml-8px text-16px text-#2080f0" />
                            <NText type="info">耗时 [{{ pane.result?.duration ?? '-' }}]</NText>
                          </div>
                          <NPagination
                            v-model:page="pane.pagination!.currentPage"
                            v-model:page-size="pane.pagination!.pageSize"
                            :item-count="pane.pagination?.total ?? getTableData(pane).length"
                            :page-sizes="pageSizes"
                            show-size-picker
                            size="small"
                            :page-slot="9"
                            @update:page="(p) => onPageChange(pane, p, pane.pagination!.pageSize)"
                            @update:page-size="(s) => onPageChange(pane, pane.pagination!.currentPage, s)"
                          />
                        </div>
                      </div>
                      <div v-else class="das-empty-holder">
                        <NEmpty description="查询无结果" />
                      </div>
                    </div>
                    <div v-else class="das-empty-holder">
                      <NEmpty description="暂无查询结果" />
                    </div>
                  </NCard>
                </NSpace>
              </NTabPane>
            </NTabs>
          </NCard>
        </NSpace>
      </NGi>
    </NGrid>
  </NCard>
</template>

<style scoped>
.das-page {
  height: calc(100vh - 120px);
}
.das-left-card {
  height: calc(100vh - 144px);
}
.das-tree-scroll {
  max-height: calc(100vh - 260px);
}
.das-shell-header .das-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.das-subtitle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}
.das-editor-card {
  padding-bottom: 4px;
}
.das-editor-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-top: 8px;
}
.das-result-card {
  padding-bottom: 4px;
}
.das-result-meta {
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.das-result-stat {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
}
.das-empty-holder {
  padding: 32px 0;
}
.das-hint {
  font-size: 12px;
}
/* 美化 SQL 编辑框：容器边框、圆角与内边距 */
.code-editor-container {
  border: 1px solid var(--n-border-color);
  border-radius: 8px;
  background-color: var(--n-color);
  margin-bottom: 8px;
}
.code-editor-container :deep(.cm-editor) {
  background-color: transparent;
  font-family: 'JetBrains Mono', 'Fira Code', Menlo, Monaco, 'Courier New', monospace;
  font-size: 13px;
}
.code-editor-container :deep(.cm-scroller) {
  min-height: 300px;
  padding: 4px;
}
.code-editor-container :deep(.cm-gutters) {
  background-color: var(--n-color);
  border-right: 1px solid var(--n-border-color);
}
.code-editor-container :deep(.cm-activeLine) {
  background-color: rgba(0, 0, 0, 0.03);
}
/* 左侧 NTree 自定义节点样式 */
:deep(.n-tree .n-tree-node) {
  --das-tree-type-color: var(--primary-color);
}
:deep(.n-tree) {
  /* 紧凑化节点前缀与内容之间的间距 */
  --n-node-gap: 0px;
}

:deep(.das-tree-item) {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}
/* 表节点：两行布局 */
:deep(.das-tree-item-table) {
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}
:deep(.das-tree-item-meta-row) {
  display: inline-flex;
  width: 100%;
  justify-content: flex-start;
  gap: 8px;
}
:deep(.das-tree-item-left) {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}
:deep(.das-tree-item-left > .iconify),
:deep(.das-tree-item-left > svg) {
  display: inline-block;
  flex: 0 0 auto;
  vertical-align: middle;
}
:deep(.das-tree-item-name) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:deep(.das-tree-item-type),
:deep(.das-tree-item-count) {
  color: var(--das-tree-type-color);
  font-size: 12px;
  flex: 0 0 auto;
  white-space: nowrap;
  margin-right: 12px;
}
/* 覆盖：表节点的数量允许换行（正常渲染） */
:deep(.das-tree-item-table .das-tree-item-count) {
  white-space: normal;
  margin-right: 0;
}
/* 新增：可点击的“列(数量)”视觉样式 */
:deep(.das-tree-item-count-toggle) {
  cursor: pointer;
  user-select: none;
  display: inline-flex;
  align-items: center;
  gap: 0px;
  white-space: nowrap;
}
:deep(.das-tree-item-count-toggle > .iconify),
:deep(.das-tree-item-count-toggle > svg) {
  display: inline-block;
  flex: 0 0 auto;
  vertical-align: middle;
}
:deep(.n-tree-node:hover) .das-tree-item-type,
:deep(.n-tree-node:hover) .das-tree-item-count {
  filter: saturate(1.2);
}
/* 新增：加/减号开关图标样式 */
:deep(.das-tree-switcher-icon) {
  font-size: 14px;
  line-height: 1;
  vertical-align: middle;
}
/* 收紧展开图标与节点内容之间的间距 */
:deep(.n-tree-node-switcher) {
  margin-right: 0px !important;
  transform: none !important;
}
/* 进一步收紧节点内容间距 */
:deep(.n-tree-node-content) {
  gap: 0px !important;
  padding-left: 0px !important;
  margin-left: 0px !important;
}
:deep(.n-tree-node-content__prefix) {
  margin-right: 0px !important;
}
</style>