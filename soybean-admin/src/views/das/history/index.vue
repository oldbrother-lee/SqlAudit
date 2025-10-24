<script setup lang="ts">
import { ref, onMounted, computed, h } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

// 响应式数据
const loading = ref(false);
const historyList = ref<any[]>([]);
const searchKeyword = ref('');

// 模拟数据
const mockHistory = [
  {
    id: 1,
    sql_content: 'SELECT * FROM users WHERE created_at >= "2024-01-01"',
    database_name: 'production',
    table_name: 'users',
    execution_time: 120,
    rows_affected: 1500,
    status: 'success',
    executed_at: '2024-01-15 16:30:00'
  },
  {
    id: 2,
    sql_content: 'UPDATE orders SET status = "completed" WHERE id = 12345',
    database_name: 'production',
    table_name: 'orders',
    execution_time: 45,
    rows_affected: 1,
    status: 'success',
    executed_at: '2024-01-15 15:20:00'
  },
  {
    id: 3,
    sql_content: 'SELECT COUNT(*) FROM products WHERE category_id = 5',
    database_name: 'analytics',
    table_name: 'products',
    execution_time: 89,
    rows_affected: 0,
    status: 'error',
    executed_at: '2024-01-15 14:10:00'
  }
];

// 计算属性
const filteredHistory = computed(() => {
  if (!searchKeyword.value) {
    return historyList.value;
  }
  return historyList.value.filter(item => 
    item.sql_content.toLowerCase().includes(searchKeyword.value.toLowerCase()) ||
    item.database_name.toLowerCase().includes(searchKeyword.value.toLowerCase()) ||
    item.table_name.toLowerCase().includes(searchKeyword.value.toLowerCase())
  );
});

// 方法
const loadHistory = async () => {
  loading.value = true;
  try {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 500));
    historyList.value = mockHistory;
  } catch (error) {
    console.error('Failed to load history:', error);
    window.$message?.error('加载历史查询失败');
  } finally {
    loading.value = false;
  }
};

const reuseQuery = (history: any) => {
  console.log('Reuse query:', history.sql_content);
  window.$message?.success('SQL已复制到剪贴板');
  navigator.clipboard.writeText(history.sql_content);
};

const addToFavorites = async (history: any) => {
  try {
    // 模拟添加到收藏
    window.$message?.success('已添加到收藏');
  } catch (error) {
    console.error('Failed to add to favorites:', error);
    window.$message?.error('添加收藏失败');
  }
};

const getStatusType = (status: string) => {
  switch (status) {
    case 'success':
      return 'success';
    case 'error':
      return 'error';
    case 'warning':
      return 'warning';
    default:
      return 'default';
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case 'success':
      return '成功';
    case 'error':
      return '失败';
    case 'warning':
      return '警告';
    default:
      return '未知';
  }
};

onMounted(() => {
  loadHistory();
});

const columns: any[] = [
  {
    title: '状态',
    key: 'status',
    render(row: any) {
      const type = getStatusType(row.status);
      const text = getStatusText(row.status);
      return h('span', { class: `n-tag n-tag--${type} n-tag--small` }, text);
    }
  },
  {
    title: '库.表',
    key: 'dbTable',
    render(row: any) {
      return `${row.database_name}.${row.table_name}`;
    }
  },
  { title: 'SQL', key: 'sql_content' },
  { title: '执行时间(ms)', key: 'execution_time' },
  { title: '影响行数', key: 'rows_affected' },
  { title: '执行时间点', key: 'executed_at' },
  {
    title: '操作',
    key: 'actions',
    render(row: any) {
      return h(
        'div',
        { style: 'display:flex; gap:8px;' },
        [
          h(
            'button',
            {
              class: 'n-button n-button--primary n-button--small',
              onClick: () => reuseQuery(row)
            },
            '复用'
          ),
          h(
            'button',
            {
              class: 'n-button n-button--small',
              onClick: () => addToFavorites(row)
            },
            '收藏'
          )
        ]
      );
    }
  }
];
</script>

<template>
  <div class="history-container">
    <NCard :bordered="false" size="small">
      <template #header>
        <NSpace justify="space-between">
          <span>历史查询</span>
          <NSpace>
            <NInput
              v-model:value="searchKeyword"
              placeholder="搜索SQL、数据库或表名"
              clearable
              style="width: 200px"
            >
              <template #prefix>
                <SvgIcon icon="i-carbon-search" />
              </template>
            </NInput>
            <NButton type="primary" size="small" @click="loadHistory">
              <template #icon>
                <SvgIcon icon="i-carbon-refresh" />
              </template>
              刷新
            </NButton>
          </NSpace>
        </NSpace>
      </template>
      
      <NSpin :show="loading">
        <div v-if="filteredHistory.length === 0" class="empty-state">
          <NEmpty description="暂无历史查询记录" />
        </div>
        <div v-else>
          <NDataTable :columns="columns" :data="filteredHistory" size="small" />
        </div>
      </NSpin>
    </NCard>
  </div>
</template>

<style scoped>
.history-container {
  height: 100%;
}

.history-list, .history-item, .sql-content, .execution-info { display: none; }
</style>