<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, reactive, ref } from 'vue';
import type { Ref } from 'vue';
import { NButton, NCard, NDataTable, NForm, NFormItem, NInput, NSelect, NSwitch, NTag } from 'naive-ui';
import type { DataTableColumns, PaginationProps } from 'naive-ui';
import { fetchOrdersList } from '@/service/api/orders';
import { useRouterPush } from '@/hooks/common/router';

defineOptions({
  name: 'DasOrdersList'
});

interface QueryParams {
  environment: string;
  progress: string;
  search: string;
}

const { routerPushByKey } = useRouterPush();

const loading = ref(false);
const onlyMyOrders = ref(true);
const data = ref<Api.Orders.Order[]>([]);
const total = ref(0);
const queryParams: QueryParams = reactive({
  environment: '',
  progress: '',
  search: ''
});

const pagination: PaginationProps = reactive({
  page: 1,
  pageSize: 20,
  showSizePicker: true,
  pageSizes: [10, 20, 50, 100],
  onChange: (page: number) => {
    pagination.page = page;
    getOrdersList();
  },
  onUpdatePageSize: (pageSize: number) => {
    pagination.pageSize = pageSize;
    pagination.page = 1;
    getOrdersList();
  }
});

// 环境选项
const environmentOptions = computed(() => [
  { label: '全部', value: '' },
  { label: '开发环境', value: 'dev' },
  { label: '测试环境', value: 'test' },
  { label: '生产环境', value: 'prod' }
]);

// 进度选项
const progressOptions = computed(() => [
  { label: '全部', value: '' },
  { label: '待审核', value: 'pending' },
  { label: '审核中', value: 'reviewing' },
  { label: '已通过', value: 'approved' },
  { label: '已拒绝', value: 'rejected' },
  { label: '执行中', value: 'executing' },
  { label: '已完成', value: 'completed' },
  { label: '已关闭', value: 'closed' }
]);

// 计算属性
const filteredData = computed(() => {
  return data.value.filter((item: Api.Orders.Order) => {
    if (onlyMyOrders.value) {
      // 这里需要根据实际的用户信息进行过滤
      // return item.creator === currentUser.value;
    }
    return true;
  });
});

// 工具函数
const getProgressTagColor = (status: string) => {
  const colorMap: Record<string, any> = {
    待审核: 'warning',
    审核中: 'info',
    已通过: 'success',
    已拒绝: 'error',
    执行中: 'info',
    已完成: 'success',
    已关闭: 'default'
  };
  return colorMap[status] || 'default';
};

// 表格列定义
const columns: DataTableColumns<any> = [
  {
    key: 'progress',
    title: '进度',
    width: 100,
    render: row => {
      const color = getProgressTagColor(row.progress);
      return h(NTag, { type: color }, () => row.progress);
    }
  },
  {
    key: 'order_title',
    title: '工单标题',
    width: 180,
    ellipsis: {
      tooltip: true
    },
    render: row => {
      if (!row.order_title) return '';
      const parts = row.order_title.split('_');
      if (parts.length > 1) {
        parts.pop(); // 删除最后一部分
        return parts.join('_');
      }
      return row.order_title;
    }
  },
  {
    key: 'applicant',
    title: '申请人',
    width: 100
  },
  {
    key: 'sql_type',
    title: 'SQL类型',
    width: 100
  },
  {
    key: 'environment',
    title: '环境',
    width: 100
  },
  {
    key: 'instance',
    title: '实例',
    width: 150,
    ellipsis: {
      tooltip: true
    }
  },
  {
    key: 'schema',
    title: '库名',
    width: 180
  },
  {
    key: 'created_at',
    title: '创建时间',
    width: 150
  }
];

// 行键
const rowKey = (row: any) => row.order_id;

// 为行绑定点击事件
const rowProps = (rowData: any) => ({
  style: 'cursor: pointer',
  onClick: () => handleRowClick(rowData)
});

// 获取工单列表
async function getOrdersList() {
  try {
    loading.value = true;
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      environment: queryParams.environment,
      status: queryParams.progress,
      search: queryParams.search,
      only_my_orders: onlyMyOrders.value ? 1 : 0
    };

    const response = await fetchOrdersList(params);

    if (response.data) {
      // 由于API返回的是直接的数组而不是分页对象，需要进行类型转换
      const ordersList = response.data as unknown as Api.Orders.Order[];
      data.value = ordersList || [];
      total.value = ordersList ? ordersList.length : 0;
      pagination.itemCount = total.value;
    }
  } catch (error) {
    console.error('获取工单列表失败:', error);
  } finally {
    loading.value = false;
  }
}

// 处理我的工单切换
function handleMyOrdersChange() {
  pagination.page = 1;
  getOrdersList();
}

// 处理搜索
function handleSearch() {
  pagination.page = 1;
  getOrdersList();
}

// 处理刷新
function handleRefresh() {
  getOrdersList();
}

// 处理分页变化
function handlePageChange(page: number) {
  pagination.page = page;
  getOrdersList();
}

// 处理页大小变化
function handlePageSizeChange(pageSize: number) {
  pagination.pageSize = pageSize;
  pagination.page = 1;
  getOrdersList();
}

const handleViewDetail = (orderId: number) => {
  // 跳转到工单详情页
  console.log('查看工单详情:', orderId);
};

// 处理行点击事件
const handleRowClick = (row: any) => {
  console.log('行点击事件触发:', row);
  console.log('准备跳转到工单详情页，ID:', row.order_id);
  // 跳转到工单详情页
  routerPushByKey('das_orders-detail', { params: { id: row.order_id.toString() } });
};

// 定时刷新
let refreshTimer: NodeJS.Timeout | null = null;

onMounted(() => {
  getOrdersList();

  // 每30秒刷新一次
  refreshTimer = setInterval(() => {
    getOrdersList();
  }, 30000);
});

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
});
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <NCard title="工单列表" :bordered="false" size="small" class="card-wrapper sm:flex-1-hidden">
      <template #header-extra>
        <div class="flex-y-center gap-12px">
          <span class="text-14px">只看我的</span>
          <NSwitch v-model:value="onlyMyOrders" size="small" @update:value="handleMyOrdersChange" />
        </div>
      </template>

      <!-- 搜索表单 -->
      <div class="mb-12px">
        <NForm ref="queryFormRef" inline :model="queryParams" label-placement="left">
          <NFormItem label="环境">
            <NSelect
              v-model:value="queryParams.environment"
              placeholder="请选择环境"
              clearable
              class="w-200px"
              :options="environmentOptions"
            />
          </NFormItem>
          <NFormItem label="进度">
            <NSelect
              v-model:value="queryParams.progress"
              placeholder="请选择进度"
              clearable
              class="w-200px"
              :options="progressOptions"
            />
          </NFormItem>
          <NFormItem label="工单标题">
            <NInput
              v-model:value="queryParams.search"
              placeholder="输入要查询工单标题"
              clearable
              class="w-300px"
              @keydown.enter="handleSearch"
            />
          </NFormItem>
          <NFormItem>
            <NButton type="primary" @click="handleSearch">
              <template #icon>
                <icon-ic-round-search class="text-icon" />
              </template>
              查询
            </NButton>
          </NFormItem>
        </NForm>
      </div>

      <!-- 数据表格 -->
      <NDataTable
        :columns="columns"
        :data="data"
        :loading="loading"
        :pagination="pagination"
        :row-key="rowKey"
        :row-props="rowProps"
        flex-height
        remote
        class="sm:h-full"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>
  </div>
</template>

<style scoped>
.card-wrapper {
  @apply flex-col-stretch gap-16px overflow-hidden;
}
</style>
