<script setup lang="ts">
import { ref, computed, onMounted, nextTick, onUnmounted, h, watch } from 'vue';
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
// 使用普通textarea

const { t } = useI18n();

// 响应式数据
const asideWidth = ref(450);
const selectedSchema = ref<any>({});
const activeKey = ref('1');
const newTabIndex = ref(2);
const tabCompletion = ref<any>({});
// 移除splitSize，改用简单布局

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

// 过滤后的树数据
const filteredTreeData = computed(() => {
  const kw = leftTableSearch.value.trim().toLowerCase();
  if (!kw || searchTreeData.value.length === 0) return treeData.value;
  return treeData.value.filter((node: any) => {
    const title = (node.label || node.title || '').toLowerCase();
    return title.includes(kw);
  });
});

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
}

const panes = ref<EditorPane[]>([
  {
    title: 'Tab 1',
    key: '1',
    closable: false,
    sql: '',
    sessionVars: '',
    characterSet: 'utf8',
    theme: 'default',
    result: null,
    loading: false,
    responseMsg: ''
  }
]);

const tabIndex = computed(() => {
  return panes.value.findIndex((v) => v.key === activeKey.value);
});

const currentPane = computed<EditorPane>(() => panes.value[tabIndex.value] || panes.value[0]);

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
  // 仅首次挂载时创建，避免由于 pane.sql 更新导致的重复渲染触发
  if (!editorViews.value[pane.key]) {
    createEditor(pane, el);
  }
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


// 字符集选项
const characterSets = [
  { label: 'utf8', value: 'utf8' },
  { label: 'utf8mb4', value: 'utf8mb4' },
  { label: 'latin1', value: 'latin1' }
];

// 主题选项
const codeThemes = [
  { label: 'VS Dark', value: 'vs-dark' },
  { label: 'VS Light', value: 'vs' },
  { label: 'High Contrast Dark', value: 'hc-black' },
  { label: 'High Contrast Light', value: 'hc-light' }
];

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
};

// 右侧编辑器方法
const foldLeft = () => {
  asideWidth.value = asideWidth.value === 0 ? 450 : 0;
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
    title: `New Tab ${activeKeyValue}`,
    key: activeKeyValue.toString(),
    closable: true,
    sql: loadCodeFromCache(`dms-codemirror-${activeKeyValue}`),
    sessionVars: '',
    characterSet: 'utf8',
    theme: 'default',
    result: null,
    loading: false,
    responseMsg: ''
  });
  activeKey.value = activeKeyValue.toString();
};

const remove = (targetKey: string) => {
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

// 测试表格数据
const testTableData = (pane: EditorPane) => {
  console.log('Testing table data...');
  
  // 使用更简单的数据结构
  const testData = [
    { id: 1, name: '张三', email: 'zhangsan@example.com', created_at: '2024-01-01' },
    { id: 2, name: '李四', email: 'lisi@example.com', created_at: '2024-01-02' },
    { id: 3, name: '王五', email: 'wangwu@example.com', created_at: '2024-01-03' },
    { id: 4, name: '赵六', email: 'zhaoliu@example.com', created_at: '2024-01-04' },
    { id: 5, name: '钱七', email: 'qianqi@example.com', created_at: '2024-01-05' }
  ];
  
  pane.result = {
    columns: ['id', 'name', 'email', 'created_at'],
    data: testData,
    rows: testData, // 同时提供两种格式
    duration: '50ms',
    affected_rows: 5,
    affectedRows: 5
  };
  
  pane.responseMsg = '结果: 执行成功<br>耗时: 50ms<br>SQL: SELECT * FROM test_table<br>请求ID: TEST-123';
  
  console.log('Test data set:', pane.result);
  
  // 更新表格列设置
  updateTableColumnChecks(pane);
  
  window.$message?.success('测试数据已加载');
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

// 表格列设置
const tableColumnChecks = ref<NaiveUI.TableColumnCheck[]>([]);

// 更新表格列设置
const updateTableColumnChecks = (pane: EditorPane) => {
  const columns = getTableColumns(pane);
  tableColumnChecks.value = columns.map((col: any) => ({
    key: col.key as string,
    title: col.title as string,
    checked: true
  }));
};

// 编辑器事件处理
const onEditorChange = (pane: EditorPane, value: string) => {
  pane.sql = value;
  saveCodeToCache(pane);
};

// 拖拽相关
const isDragging = ref(false);
const startX = ref(0);
const startWidth = ref(asideWidth.value);

const onMouseDown = (e: MouseEvent) => {
  if (asideWidth.value === 0) return;
  isDragging.value = true;
  startX.value = e.clientX;
  startWidth.value = asideWidth.value;
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
};

const onMouseMove = (e: MouseEvent) => {
  if (!isDragging.value) return;
  const dx = e.clientX - startX.value;
  const next = startWidth.value + dx;
  asideWidth.value = Math.min(800, Math.max(64, next));
  
  if (asideWidth.value < 64) {
    asideWidth.value = 0;
    onMouseUp();
  }
};

const onMouseUp = () => {
  if (!isDragging.value) return;
  isDragging.value = false;
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
};

// 树节点点击
const handleNodeClick = (keys: string[], e: any) => {
  console.log('Node clicked:', keys, e);
};

// 树节点双击填充SQL
const handleNodeDblClick = (key: string) => {
  if (!key) return;
  const parts = key.split('#');
  if (parts.length !== 2) return; // 只对表节点生效
  
  const [schema, table] = parts;
  const p = currentPane.value;
  const dbType = selectedSchema.value['db_type']?.toLowerCase() || 'mysql';
  
  if (dbType === 'clickhouse') {
    p.sql = `SELECT * FROM "${schema}"."${table}" LIMIT 100;`;
  } else {
    p.sql = `SELECT * FROM \`${schema}\`.\`${table}\` LIMIT 100;`;
  }
};

onMounted(async () => {
  await getSchemas();
  loadPaneFromCache(currentPane.value);
});

onUnmounted(() => {
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
});
</script>

<template>
  <div class="das-edit-container">
    <NCard :bordered="false" class="edit-card">
      <div class="fold-container">
        <!-- 左侧面板 -->
        <div 
          v-show="asideWidth > 0" 
          class="left-panel" 
          :style="{ width: asideWidth + 'px' }"
        >
          <NCard size="small" title="数据库列表" :bordered="false">
              <NSpace vertical :size="8">
                <NGrid cols="24" x-gap="8" y-gap="4">
                  <NGi span="20">
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
                  </NGi>
                  <NGi span="4" class="flex items-center justify-end">
                    <NTooltip trigger="hover">
                      <template #trigger>
                      <NButton quaternary circle :loading="refreshLoading" @click="refreshSchemas">
                          <template #icon>
                            <SvgIcon icon="i-carbon-renew" />
                          </template>
                        </NButton>
                      </template>
                      动态刷新库名
                    </NTooltip>
                  </NGi>
                </NGrid>
              
              <NInput 
                v-if="showSearch" 
                v-model:value="leftTableSearch" 
                clearable 
                placeholder="输入要搜索的表名..."
                @keyup.enter="onSearch(leftTableSearch)"
              />
              
              <NSpin :show="treeLoading">
                <div class="tree-container">
                <NTree
                    :data="filteredTreeData"
                  block-line
                  :virtual-scroll="true"
                    :node-props="(info: any) => ({
                      onDblclick: () => handleNodeDblClick(info.option.key)
                    })"
                    @update:selected-keys="handleNodeClick"
                  />
                </div>
              </NSpin>
              </NSpace>
            </NCard>
        </div>
        
        <!-- 分割线 -->
        <div class="divider" @mousedown="onMouseDown">
          <NButton
            v-if="asideWidth === 0"
            circle
            quaternary
            @click="foldLeft"
          >
            <template #icon>
              <SvgIcon icon="i-carbon-chevron-right" />
            </template>
          </NButton>
        </div>
        
        <!-- 右侧主要内容区 -->
        <div class="main-panel">
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
              class="tab-pane-container"
            >
              <div class="tab-content">
                <!-- 上半部分：编辑器区域 -->
                <div class="editor-area">
                  <NSpace vertical :size="12">
                    <!-- 工具栏 -->
                    <NCard size="small" :bordered="false">
                      <NSpace vertical :size="8">
                      <NGrid cols="24" x-gap="12" y-gap="8">
                          <NGi span="24 m:12">
                            <NInput
                              v-model:value="pane.sessionVars"
                              placeholder="group_concat_max_len=4194304;sql_mode=''"
                              clearable
                            />
                        </NGi>
                          <NGi span="12 m:6">
                            <NSelect
                              v-model:value="pane.characterSet"
                              :options="characterSets"
                              placeholder="选择字符集"
                            />
                        </NGi>
                          <NGi span="12 m:6">
                            <NSelect
                              v-model:value="pane.theme"
                              :options="codeThemes"
                              placeholder="选择主题"
                            />
                        </NGi>
                      </NGrid>
                      </NSpace>
                    </NCard>
                    
                    <!-- SQL编辑器 -->
                    <NCard size="small" :bordered="false">
                      <div
                        class="sql-editor cm-container"
                        :ref="(el) => setEditorRef(pane, el as unknown as HTMLElement)"
                      />
                      
                      <NSpace class="mt-8px">
                      <NButton type="primary" :loading="pane.loading" @click="executeSQL(pane)">
                          <template #icon><SvgIcon icon="i-carbon-flash" /></template>
                          执行SQL
                      </NButton>
                        <NButton @click="formatSQL(pane)">
                          <template #icon><SvgIcon icon="i-carbon-code" /></template>
                          格式化
                        </NButton>
                        <NButton @click="loadDBDictData">
                          <template #icon><SvgIcon icon="i-carbon-document" /></template>
                          数据字典
                          </NButton>
                      <NButton quaternary @click="foldLeft">
                          <template #icon><SvgIcon :icon="asideWidth === 0 ? 'i-carbon-chevron-right' : 'i-carbon-chevron-left'" /></template>
                          {{ asideWidth === 0 ? '展开' : '收起' }}左侧
                      </NButton>
                  </NSpace>
                </NCard>
                    
                    <!-- 响应消息 -->
                    <NCard v-if="pane.responseMsg" size="small" title="执行结果" :bordered="true" class="response-card">
                      <div v-html="pane.responseMsg" class="response-msg"></div>
                    </NCard>
                  </NSpace>
                </div>
                
                <!-- 下半部分：查询结果区域 -->
                <div class="result-area">
                  <!-- 查询结果 -->
                  <NCard v-if="pane.result" size="small" :bordered="true" class="result-card">
                    <template #header>
                      <NSpace justify="space-between" align="center">
                        <span>查询结果</span>
                        <NSpace>
                          <NButton size="small" @click="updateTableColumnChecks(pane)">
                            <template #icon>
                              <SvgIcon icon="i-carbon-refresh" />
                            </template>
                            刷新列设置
                          </NButton>
                          <TableColumnSetting v-model:columns="tableColumnChecks" />
                        </NSpace>
                      </NSpace>
                    </template>
                    
                    <NDescriptions label-placement="left" bordered size="small" :column="3" class="mb-12px">
                      <NDescriptionsItem label="耗时">{{ pane.result?.duration || '-' }}</NDescriptionsItem>
                      <NDescriptionsItem label="影响行数">{{ pane.result?.affected_rows ?? pane.result?.affectedRows ?? '-' }}</NDescriptionsItem>
                      <NDescriptionsItem label="返回行数">{{ (pane.result?.rows?.length || pane.result?.data?.length || 0) }}</NDescriptionsItem>
                  </NDescriptions>
                    
                    <div v-if="getTableData(pane).length > 0" class="table-container">
                      <!-- 调试信息 -->
                      <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
                        调试: 列数={{ getTableColumns(pane).length }}, 行数={{ getTableData(pane).length }}
                      </div>
                      <vxe-table
                        :data="getTableData(pane)"
                        border
                        stripe
                        :height="400"
                        :column-config="{ resizable: true }"
                        :scroll-y="{ enabled: true }"
                        show-overflow
                      >
                        <vxe-column
                          v-for="col in getTableColumns(pane)"
                          :key="col.key"
                          :field="col.key"
                          :title="col.title"
                          :min-width="col.minWidth || 120"
                        />
                      </vxe-table>
                    </div>
                    <div v-else class="empty-result">
                      <NEmpty description="查询无结果" />
                    </div>
                </NCard>
                  
                  <!-- 无结果时的占位 -->
                  <div v-else class="no-result-placeholder">
                    <NEmpty description="暂无查询结果" />
                  </div>
                </div>
              </div>
            </NTabPane>
          </NTabs>
        </div>
      </div>
      </NCard>
  </div>
</template>

<style scoped>
.das-edit-container {
  height: 100%;
}

.edit-card {
  height: calc(100vh - 200px);
}

.fold-container {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.left-panel {
  height: 100%;
  padding-right: 6px;
  overflow: hidden;
}

.tree-container {
  max-height: calc(100vh - 380px);
  overflow-y: auto;
  overflow-x: hidden;
}

.divider {
  width: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--n-border-color);
  cursor: col-resize;
  position: relative;
  user-select: none;
}

.divider:hover {
  background-color: var(--n-primary-color);
}

.main-panel {
  flex: 1;
  height: 100%;
  padding-left: 6px;
  overflow: hidden;
}

/* CodeMirror container styles */
.sql-editor.cm-container {
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
  min-height: 240px;
}

.sql-editor :deep(.cm-editor) {
  font-family: 'JetBrains Mono', 'Fira Code', Menlo, Monaco, 'Courier New', monospace;
  font-size: 14px;
}

.sql-editor :deep(.cm-scroller) {
  min-height: 240px;
}

/* 行号与折叠样式 */
.sql-editor :deep(.cm-gutters) {
  background-color: var(--n-color);
  border-right: 1px solid var(--n-border-color);
}
.sql-editor :deep(.cm-foldGutter .cm-gutterElement) {
  cursor: pointer;
}

.response-card {
  max-height: 150px;
  overflow-y: auto;
}

.response-msg {
  font-size: 12px;
  line-height: 1.8;
}

.mt-8px { 
  margin-top: 8px; 
}

.mt-12px { 
  margin-top: 12px; 
}

.mb-12px { 
  margin-bottom: 12px; 
}

.empty-result {
  padding: 40px;
  text-align: center;
}

.tab-pane-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.tab-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.editor-area {
  flex: 0 0 auto;
  min-height: 300px;
  max-height: 50vh;
  overflow-y: auto;
}

.result-area {
  flex: 1;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.result-card {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.table-container {
  flex: 1;
  overflow: auto;
  min-height: 300px;
}

.no-result-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  min-height: 200px;
  height: 100%;
}
</style>