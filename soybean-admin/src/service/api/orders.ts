import { request } from '../request';

/** Orders API */

/**
 * Get environments for orders
 */
export function fetchOrdersEnvironments(params?: Record<string, any>) {
  return request<Api.Orders.Environment[]>({
    url: '/api/v1/orders/environments',
    method: 'get',
    params
  });
}

/**
 * Get instances for specified environment
 */
export function fetchOrdersInstances(params?: Record<string, any>) {
  return request<Api.Orders.Instance[]>({
    url: '/api/v1/orders/instances',
    method: 'get',
    params
  });
}

/**
 * Get schemas for specified instance
 */
export function fetchOrdersSchemas(params?: Record<string, any>) {
  return request<Api.Orders.Schema[]>({
    url: '/api/v1/orders/schemas',
    method: 'get',
    params
  });
}

/**
 * Get users for review/audit/cc
 */
export function fetchOrdersUsers(params?: Record<string, any>) {
  return request<Api.Orders.User[]>({
    url: '/api/v1/orders/users',
    method: 'get',
    params
  });
}

/**
 * Syntax check for SQL
 */
export function fetchSyntaxCheck(data: Api.Orders.SyntaxCheckRequest) {
  return request<Api.Orders.SyntaxCheckResult>({
    url: '/api/v1/orders/syntax-inspect',
    method: 'post',
    data,
    timeout: 10 * 60 * 1000
  });
}

/**
 * Create order
 */
export function fetchCreateOrder(data: Api.Orders.CreateOrderRequest) {
  return request<Api.Orders.Order>({
    url: '/api/v1/orders/commit',
    method: 'post',
    data
  });
}

/**
 * Get orders list
 */
export function fetchOrdersList(params?: Record<string, any>) {
  return request<Api.Orders.OrdersList>({
    url: '/api/v1/orders',
    method: 'get',
    params
  });
}

/**
 * Get order detail
 */
export function fetchOrderDetail(params?: Record<string, any>) {
  return request<Api.Orders.OrderDetail>({
    url: '/api/v1/orders/detail',
    method: 'get',
    params
  });
}

/**
 * Get operation logs
 */
export function fetchOpLogs(params?: Record<string, any>) {
  return request<Api.Orders.OpLog[]>({
    url: '/api/v1/orders/oplogs',
    method: 'get',
    params
  });
}

/**
 * Approve order
 */
export function fetchApproveOrder(data: Api.Orders.ApproveOrderRequest) {
  return request({
    url: '/api/v1/orders/approve',
    method: 'post',
    data
  });
}

/**
 * Feedback order
 */
export function fetchFeedbackOrder(data: Api.Orders.FeedbackOrderRequest) {
  return request({
    url: '/api/v1/orders/feedback',
    method: 'post',
    data
  });
}

/**
 * Review order
 */
export function fetchReviewOrder(data: Api.Orders.ReviewOrderRequest) {
  return request({
    url: '/api/v1/orders/review',
    method: 'post',
    data
  });
}

/**
 * Close order
 */
export function fetchCloseOrder(data: Api.Orders.CloseOrderRequest) {
  return request({
    url: '/api/v1/orders/close',
    method: 'post',
    data
  });
}

/**
 * Hook order
 */
export function fetchHookOrder(data: Api.Orders.HookOrderRequest) {
  return request({
    url: '/api/v1/orders/hook',
    method: 'post',
    data
  });
}

/**
 * Generate tasks
 */
export function fetchGenerateTasks(data: Api.Orders.GenerateTasksRequest) {
  return request<Api.Orders.Task[]>({
    url: '/api/v1/orders/tasks/generate',
    method: 'post',
    data
  });
}

/**
 * Get tasks
 */
export function fetchTasks(params?: Record<string, any>) {
  return request<Api.Orders.Task[]>({
    url: '/api/v1/orders/tasks',
    method: 'get',
    params
  });
}

/**
 * Preview tasks
 */
export function fetchPreviewTasks(params?: Record<string, any>) {
  return request<Api.Orders.TaskPreview>({
    url: '/api/v1/orders/tasks/preview',
    method: 'get',
    params
  });
}

/**
 * Execute single task
 */
export function fetchExecuteSingleTask(data: Api.Orders.ExecuteTaskRequest) {
  return request<Api.Orders.TaskResult>({
    url: '/api/v1/orders/tasks/execute/single',
    method: 'post',
    data
  });
}

/**
 * Execute all tasks
 */
export function fetchExecuteAllTasks(data: Api.Orders.ExecuteAllTasksRequest) {
  return request<Api.Orders.TaskResult>({
    url: '/api/v1/orders/tasks/execute/all',
    method: 'post',
    data
  });
}

/**
 * Download export file
 */
export function fetchDownloadExportFile(params?: Record<string, any>) {
  return request<Blob>({
    url: '/api/v1/orders/download',
    method: 'get',
    params,
    responseType: 'blob'
  });
}