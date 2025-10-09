/*
@Time    :   2023/10/24 19:14:17
@Author  :   xff
*/

package services

import (
	"fmt"
	"goInsight/global"
	commonModels "goInsight/internal/common/models"
	"goInsight/internal/inspect/checker"
	"goInsight/internal/orders/forms"
	"goInsight/pkg/parser"

	"github.com/gin-gonic/gin"
)

type SyntaxInspectService struct {
	*forms.SyntaxInspectForm
	C        *gin.Context
	Username string
}

// 获取实例配置
func (s *SyntaxInspectService) getInstanceConfig() (commonModels.InsightDBConfig, error) {
	// 获取实例配置
	var config commonModels.InsightDBConfig
	tx := global.App.DB.Table("`insight_db_config`").
		Where("instance_id=?", s.InstanceID).
		First(&config)
	if tx.RowsAffected == 0 {
		return config, fmt.Errorf("未找到实例ID为%s的记录", s.InstanceID)
	}
	return config, nil
}

// 审核SQL
func (s *SyntaxInspectService) inspectSQL(config commonModels.InsightDBConfig) ([]checker.ReturnData, error) {
	inspect := checker.SyntaxInspectService{
		C:          s.C,
		DbUser:     global.App.Config.RemoteDB.UserName,
		DbPassword: global.App.Config.RemoteDB.Password,
		DbHost:     config.Hostname,
		DbPort:     config.Port,
		DBParams:   config.InspectParams,
		DBSchema:   s.Schema,
		Username:   s.Username,
		SqlText:    s.Content,
	}
	return inspect.Run()
}

func (s *SyntaxInspectService) Run() (interface{}, error) {
	// 判断SQL类型是否匹配，DML工单仅允许提交DML语句，DDL工单仅允许提交DDL语句
	err := parser.CheckSqlType(s.Content, string(s.SQLType))
	if err != nil {
		return nil, err
	}
	if s.SQLType == "EXPORT" {
		// 导出工单仅检查语法是否有效，不审核，CheckSqlType已经判断类型为SELECT了
		return nil, nil
	}
	// clickhouse不审核
	if s.DBType == "ClickHouse" {
		return nil, nil
	}

	// 获取实例配置
	config, err := s.getInstanceConfig()
	if err != nil {
		return nil, err
	}

	// 审核
	returnData, err := s.inspectSQL(config)
	if err != nil {
		return nil, err
	}

	// 检查语法检查是否通过
	// status: 0表示语法检查通过，1表示语法检查不通过
	status := 0
	for _, row := range returnData {
		if row.Level != "INFO" {
			status = 1
			break
		}
	}
	// return
	return map[string]interface{}{"status": status, "data": returnData}, nil
}
