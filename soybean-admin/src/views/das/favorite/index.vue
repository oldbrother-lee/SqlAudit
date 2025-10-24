<script setup lang="ts">
import { ref, onMounted, h } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

// 响应式数据
const loading = ref(false);
const favorites = ref<any[]>([]);

// 模拟数据
const mockFavorites = [
  {
    id: 1,
    sql_content: 'SELECT * FROM users WHERE status = 1',
    description: '查询活跃用户',
    created_at: '2024-01-15 10:30:00'
  },
  {
    id: 2,
    sql_content: 'SELECT COUNT(*) FROM orders WHERE date >= CURDATE()',
    description: '今日订单统计',
    created_at: '2024-01-15 14:20:00'
  }
];

// 方法
const loadFavorites = async () => {
  loading.value = true;
  try {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 500));
    favorites.value = mockFavorites;
  } catch (error) {
    console.error('Failed to load favorites:', error);
    window.$message?.error('加载收藏SQL失败');
  } finally {
    loading.value = false;
  }
};

const useFavorite = (favorite: any) => {
  console.log('Use favorite SQL:', favorite.sql_content);
  window.$message?.success('SQL已复制到剪贴板');
  navigator.clipboard.writeText(favorite.sql_content);
};

const deleteFavorite = async (id: number) => {
  try {
    // 模拟删除操作
    favorites.value = favorites.value.filter(item => item.id !== id);
    window.$message?.success('删除成功');
  } catch (error) {
    console.error('Failed to delete favorite:', error);
    window.$message?.error('删除失败');
  }
};

onMounted(() => {
  loadFavorites();
});

const columns: any[] = [
  { title: '描述', key: 'description' },
  { title: 'SQL', key: 'sql_content' },
  { title: '创建时间', key: 'created_at' },
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
              onClick: () => useFavorite(row)
            },
            '使用'
          ),
          h(
            'button',
            {
              class: 'n-button n-button--error n-button--small',
              onClick: () => deleteFavorite(row.id)
            },
            '删除'
          )
        ]
      );
    }
  }
];
</script>

<template>
  <div class="favorite-container">
    <NCard :bordered="false" size="small">
      <template #header>
        <NSpace justify="space-between">
          <span>收藏SQL</span>
          <NButton type="primary" size="small" @click="loadFavorites">
            <template #icon>
              <SvgIcon icon="i-carbon-refresh" />
            </template>
            刷新
          </NButton>
        </NSpace>
      </template>
      
      <NSpin :show="loading">
        <div v-if="favorites.length === 0" class="empty-state">
          <NEmpty description="暂无收藏SQL" />
        </div>
        <div v-else>
          <NDataTable :columns="columns" :data="favorites" size="small" />
        </div>
      </NSpin>
    </NCard>
  </div>
</template>

<style scoped>
.favorite-container {
  height: 100%;
}

.favorites-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.favorite-item {
  border: 1px solid var(--border-color);
}

.favorite-desc {
  font-weight: 500;
}

.favorite-time {
  font-size: 12px;
  color: var(--text-color-3);
}

.sql-content {
  margin: 8px 0;
}

.empty-state {
  padding: 40px 0;
  text-align: center;
}
</style>