/**
 * Namespace Api
 *
 * All backend api type
 */
declare namespace Api {
  namespace Common {
    /** common params of paginating */
    interface PaginatingCommonParams {
      /** current page number */
      current: number;
      /** page size */
      size: number;
      /** total count */
      total: number;
    }

    /** common params of paginating query list data */
    interface PaginatingQueryRecord<T = any> extends PaginatingCommonParams {
      records: T[];
    }

    /** common search params of table */
    type CommonSearchParams = Pick<Common.PaginatingCommonParams, 'current' | 'size'>;

    /**
     * enable status
     *
     * - "1": enabled
     * - "2": disabled
     */
    type EnableStatus = '1' | '2';

    /** common record */
    type CommonRecord<T = any> = {
      /** record id */
      id: number;
      /** record creator */
      createBy: string;
      /** record create time */
      createTime: string;
      /** record updater */
      updateBy: string;
      /** record update time */
      updateTime: string;
      /** record status */
      status: EnableStatus | null;
    } & T;
  }

  /**
   * namespace Auth
   *
   * backend api module: "auth"
   */
  namespace Auth {
    interface LoginToken {
      token: string;
      refreshToken: string;
    }

    interface UserInfo {
      userId: string;
      userName: string;
      roles: string[];
      buttons: string[];
    }
  }

  /**
   * namespace Route
   *
   * backend api module: "route"
   */
  namespace Route {
    type ElegantConstRoute = import('@elegant-router/types').ElegantConstRoute;

    interface MenuRoute extends ElegantConstRoute {
      id: string;
    }

    interface UserRoute {
      routes: MenuRoute[];
      home: import('@elegant-router/types').LastLevelRouteKey;
    }
  }

  /**
   * namespace Das
   *
   * backend api module: "das" (Data Access Service)
   */
  namespace Das {
    interface Environment {
      id: number;
      name: string;
      description?: string;
    }

    interface Schema {
      id: number;
      name: string;
      instanceId: number;
      instanceName: string;
    }

    interface Table {
      id: number;
      name: string;
      schemaId: number;
      schemaName: string;
      comment?: string;
    }

    interface QueryRequest {
      sql: string;
      instanceId: number;
      schemaName: string;
      limit?: number;
    }

    interface QueryResult {
      columns: string[];
      rows: any[][];
      affectedRows?: number;
      executionTime: number;
      queryId?: string;
    }

    interface UserGrant {
      id: number;
      userId: number;
      resourceType: string;
      resourceId: number;
      permissions: string[];
    }

    interface DBDict {
      tables: TableInfo[];
    }

    interface TableInfo {
      tableName: string;
      tableComment?: string;
      columns: ColumnInfo[];
      indexes: IndexInfo[];
    }

    interface ColumnInfo {
      columnName: string;
      dataType: string;
      isNullable: boolean;
      columnDefault?: string;
      columnComment?: string;
      isPrimaryKey: boolean;
    }

    interface IndexInfo {
      indexName: string;
      columnNames: string[];
      isUnique: boolean;
    }

    interface History {
      id: number;
      sql: string;
      instanceName: string;
      schemaName: string;
      executionTime: string;
      duration: number;
      status: string;
    }

    interface Favorite {
      id: number;
      title: string;
      sql: string;
      description?: string;
      createTime: string;
    }

    interface CreateFavoriteRequest {
      title: string;
      sql: string;
      description?: string;
    }

    interface UpdateFavoriteRequest {
      id: number;
      title: string;
      sql: string;
      description?: string;
    }

    interface SchemaGrant {
      id: number;
      userId: number;
      userName: string;
      schemaId: number;
      schemaName: string;
      permissions: string[];
    }

    interface CreateSchemaGrantRequest {
      userId: number;
      schemaId: number;
      permissions: string[];
    }

    interface TableGrant {
      id: number;
      userId: number;
      userName: string;
      tableId: number;
      tableName: string;
      permissions: string[];
    }

    interface CreateTableGrantRequest {
      userId: number;
      tableId: number;
      permissions: string[];
    }

    interface Instance {
      id: number;
      name: string;
      host: string;
      port: number;
      dbType: string;
      environment: string;
    }
  }

  /**
   * namespace Orders
   *
   * backend api module: "orders"
   */
  namespace Orders {
    interface Environment {
      id: number;
      name: string;
      description?: string;
    }

    interface Instance {
      id: number;
      name: string;
      host: string;
      port: number;
      dbType: string;
    }

    interface Schema {
      id: number;
      name: string;
      instanceId: number;
    }

    interface User {
      id: number;
      username: string;
      realName: string;
      email: string;
      role: string;
    }

    interface SyntaxCheckRequest {
      sql: string;
      instanceId: number;
      dbType: string;
    }

    interface SyntaxCheckResult {
      data: {
        summary: string[] | null;
        level: string;
        affected_rows: number;
        type: string;
        finger_id: string;
        query: string;
      }[];
      /** 0: 通过, 1: 失败 */
      status: number;
    }

    interface CreateOrderRequest {
      title: string;
      description?: string;
      sql: string;
      instanceId: number;
      schemaName: string;
      orderType: string;
      reviewers: number[];
      auditors: number[];
      ccUsers?: number[];
      executeTime?: string;
    }

    interface Order {
      id: number;
      title: string;
      description?: string;
      sql: string;
      status: string;
      orderType: string;
      createTime: string;
      creator: string;
      instanceName: string;
      schemaName: string;
    }

    interface OrdersList extends Common.PaginatingQueryRecord<Order> {}

    interface OrderDetail extends Order {
      reviewers: User[];
      auditors: User[];
      ccUsers: User[];
      tasks: Task[];
      opLogs: OpLog[];
    }

    interface OpLog {
      id: number;
      orderId: number;
      action: string;
      operator: string;
      operateTime: string;
      comment?: string;
    }

    interface ApproveOrderRequest {
      orderId: number;
      comment?: string;
    }

    interface FeedbackOrderRequest {
      orderId: number;
      comment: string;
    }

    interface ReviewOrderRequest {
      orderId: number;
      approved: boolean;
      comment?: string;
    }

    interface CloseOrderRequest {
      orderId: number;
      reason: string;
    }

    interface HookOrderRequest {
      orderId: number;
      hookType: string;
      hookUrl: string;
    }

    interface GenerateTasksRequest {
      orderId: number;
    }

    interface Task {
      id: number;
      orderId: number;
      sql: string;
      status: string;
      executeTime?: string;
      duration?: number;
      affectedRows?: number;
      errorMessage?: string;
    }

    interface TaskPreview {
      tasks: Task[];
      totalCount: number;
    }

    interface ExecuteTaskRequest {
      taskId: number;
    }

    interface ExecuteAllTasksRequest {
      orderId: number;
    }

    interface TaskResult {
      success: boolean;
      message?: string;
      affectedRows?: number;
      executionTime?: number;
    }
  }

  /**
   * namespace Users
   *
   * backend api module: "users"
   */
  namespace Users {
    interface User {
      id: number;
      username: string;
      realName: string;
      email: string;
      phone?: string;
      status: Common.EnableStatus;
      roles: Role[];
      organizations: Organization[];
      createTime: string;
    }

    interface UsersList extends Common.PaginatingQueryRecord<User> {}

    interface CreateUserRequest {
      username: string;
      realName: string;
      email: string;
      phone?: string;
      password: string;
      roleIds: number[];
      organizationIds: number[];
    }

    interface UpdateUserRequest {
      uid: number;
      username: string;
      realName: string;
      email: string;
      phone?: string;
      status: Common.EnableStatus;
      roleIds: number[];
      organizationIds: number[];
    }

    interface ChangePasswordRequest {
      uid: number;
      newPassword: string;
    }

    interface Role {
      id: number;
      name: string;
      description?: string;
      permissions: string[];
      status: Common.EnableStatus;
      createTime: string;
    }

    interface CreateRoleRequest {
      name: string;
      description?: string;
      permissions: string[];
    }

    interface UpdateRoleRequest {
      id: number;
      name: string;
      description?: string;
      permissions: string[];
      status: Common.EnableStatus;
    }

    interface Organization {
      id: number;
      name: string;
      description?: string;
      parentId?: number;
      level: number;
      status: Common.EnableStatus;
      createTime: string;
      children?: Organization[];
    }

    interface CreateOrganizationRequest {
      name: string;
      description?: string;
    }

    interface CreateChildOrganizationRequest {
      name: string;
      description?: string;
      parentId: number;
    }

    interface UpdateOrganizationRequest {
      id: number;
      name: string;
      description?: string;
      status: Common.EnableStatus;
    }

    interface OrganizationUser {
      id: number;
      organizationId: number;
      organizationName: string;
      userId: number;
      username: string;
      realName: string;
    }

    interface BindOrganizationUsersRequest {
      organizationId: number;
      userIds: number[];
    }

    interface DeleteOrganizationUsersRequest {
      organizationId: number;
      userIds: number[];
    }

    interface DBConfig {
      id: number;
      name: string;
      host: string;
      port: number;
      username: string;
      dbType: string;
      environment: string;
      status: Common.EnableStatus;
      createTime: string;
    }

    interface CreateDBConfigRequest {
      name: string;
      host: string;
      port: number;
      username: string;
      password: string;
      dbType: string;
      environment: string;
    }

    interface UpdateDBConfigRequest {
      id: number;
      name: string;
      host: string;
      port: number;
      username: string;
      password?: string;
      dbType: string;
      environment: string;
      status: Common.EnableStatus;
    }
  }
}
