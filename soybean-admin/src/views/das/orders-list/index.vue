<script setup lang="tsx">
import { computed, h, onMounted, onUnmounted, reactive, ref } from 'vue';
import { NCard, NDataTable, NSwitch, NTag } from 'naive-ui';
import { useAppStore } from '@/store/modules/app';
import { useTable } from '@/hooks/common/table';
import { fetchOrdersList } from '@/service/api/orders';
import { useRouterPush } from '@/hooks/common/router';
import { $t } from '@/locales';
import OrderSearch from './modules/order-search.vue';

const appStore = useAppStore();
const { routerPushByKey } = useRouterPush();

const searchParams = reactive({
  environment: null,
  status: null,
  search: null,
  only_my_orders: 0
});

const onlyMyOrders = ref(false);

function handleMyOrdersChange(val: boolean) {
  searchParams.only_my_orders = val ? 1 : 0;
  getDataByPage();
}

const {
  columns,
  data,
  getData,
  getDataByPage,
  loading,
  mobilePagination
} = useTable({
  apiFn: fetchOrdersList,
  apiParams: searchParams,
  pagination: {
    pageSize: 10,
    pageSizes: [10, 20, 50, 100]
  },
  transformer: res => {
    const responseData = (res.data || {}) as any;
    let records: any[] = [];
    let current = 1;
    let size = (searchParams as any).size || 10;
    let total = 0;

    if (Array.isArray(responseData)) {
      records = responseData;
      total = records.length;
    } else {
      records = responseData.records || responseData.items || responseData.rows || responseData.list || responseData.data || [];
      current = responseData.current || responseData.page || responseData.page_num || 1;
      size = responseData.size || responseData.pageSize || responseData.page_size || (searchParams as any).size || 10;
      total = responseData.total || responseData.count || responseData.total_count || 0;
    }

    const pageSize = size <= 0 ? 10 : size;

    const recordsWithIndex = records.map((item, index) => {
      return {
        ...item,
        index: (current - 1) * pageSize + index + 1
      };
    });

    return {
      data: recordsWithIndex,
      pageNum: current,
      pageSize,
      total
    };
  },
  columns: () => [
    {
      key: 'index',
      title: $t('common.index'),
      align: 'center',
      width: 64
    },
    {
      key: 'progress',
      title: '进度',
      align: 'center',
      width: 100,
      render: row => {
        const color = getProgressTagColor(row.progress);
        return <NTag type={color} size="small">{row.progress}</NTag>;
      }
    },
    {
      key: 'order_title',
      title: '工单标题',
      align: 'center',
      width: 180,
      ellipsis: {
        tooltip: true
      }
    },
    {
      key: 'execution_mode',
      title: '执行方式',
      align: 'center',
      width: 150,
      render: row => {
        if (row.schedule_time) {
          return (
            <div style="display: flex; flex-direction: column; align-items: center; font-size: 12px;">
              <NTag type="info" size="small" style="margin-bottom: 4px;">定时执行</NTag>
              <span style="color: #666;">{row.schedule_time}</span>
            </div>
          );
        }
        return <NTag type="default" size="small">立即执行</NTag>;
      }
    },
    {
      key: 'applicant',
      title: '申请人',
      align: 'center',
      width: 100
    },
    {
      key: 'sql_type',
      title: 'SQL类型',
      align: 'center',
      width: 100
    },
    {
      key: 'environment',
      title: '环境',
      align: 'center',
      width: 100
    },
    {
      key: 'instance',
      title: '实例',
      align: 'center',
      width: 150,
      ellipsis: {
        tooltip: true
      }
    },
    {
      key: 'schema',
      title: '库名',
      align: 'center',
      width: 100,
      ellipsis: {
        tooltip: true
      }
    },
    {
      key: 'created_at',
      title: '创建时间',
      align: 'center',
      width: 180
    }
  ]
});

function getProgressTagColor(progress: string): NaiveUI.ThemeColor {
  switch (progress) {
    case '待审批':
    case '待执行':
      return 'warning';
    case '已驳回':
    case '已失败':
      return 'error';
    case '执行中':
      return 'info';
    case '已完成':
      return 'success';
    default:
      return 'default';
  }
}

function handleRowClick(row: Api.Orders.Order) {
  routerPushByKey('das_orders-detail', { query: { id: row.order_id } });
}

const rowProps = (row: Api.Orders.Order) => {
  return {
    style: 'cursor: pointer;',
    onClick: () => handleRowClick(row)
  };
};

function handleReset() {
  onlyMyOrders.value = false;
  searchParams.only_my_orders = 0;
  getDataByPage();
}

let refreshTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  // 自动刷新
  refreshTimer = setInterval(() => {
    getData();
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
    <OrderSearch v-model:model="searchParams" @search="getDataByPage" @reset="handleReset" />
    <NCard title="工单列表" :bordered="false" size="small" class="card-wrapper sm:flex-1-hidden">
      <template #header-extra>
        <div class="flex-y-center gap-12px">
          <span class="text-14px">只看我的</span>
          <NSwitch v-model:value="onlyMyOrders" size="small" @update:value="handleMyOrdersChange" />
        </div>
      </template>
      <NDataTable
        :columns="columns"
        :data="data"
        size="small"
        :flex-height="!appStore.isMobile"
        :scroll-x="962"
        :loading="loading"
        remote
        :row-key="row => row.order_id"
        :pagination="mobilePagination"
        :row-props="rowProps"
        class="sm:h-full"
      />
    </NCard>
  </div>
</template>

<style scoped></style>
