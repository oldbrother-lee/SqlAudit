package services

import (
	"errors"
	"fmt"
	"goInsight/global"
	"goInsight/internal/das/dao"
	"goInsight/internal/das/forms"
	"goInsight/internal/das/parser"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type GetDbDictService struct {
	*forms.GetDbDictForm
	C        *gin.Context
	Username string
}

func (s *GetDbDictService) parserUUID() (id uuid.UUID, err error) {
	id, err = uuid.Parse(s.InstanceID)
	if err != nil {
		return id, err
	}
	return id, nil
}

// 验证用户是否有指定schema的权限
func (s *GetDbDictService) validatePerms(uuid uuid.UUID) error {
	// 检查库表权限
	var tables []parser.Table
	tables = append(tables, parser.Table{Schema: s.Schema})
	checker := CheckUserPerm{
		UserName:   s.Username,
		InstanceID: uuid,
		Tables:     tables,
	}
	if err := checker.HasSchemaPerms(); err != nil {
		return err
	}
	return nil
}

func (s *GetDbDictService) getConfigFromInstanceID() (hostname string, port int, err error) {
	// 获取DB配置
	type DASConfigResult struct {
		Hostname string `json:"hostname"`
		Port     int    `json:"port"`
	}
	var result DASConfigResult
	r := global.App.DB.Table("`insight_db_config` a").
		Select("a.`hostname`, a.`port`").
		Where("a.instance_id=?", s.InstanceID).
		Take(&result)
	// 判断记录是否存在
	if errors.Is(r.Error, gorm.ErrRecordNotFound) {
		return hostname, port, fmt.Errorf("指定DB配置的记录不存在,错误的信息:%s", r.Error.Error())
	}
	return result.Hostname, result.Port, nil
}

func (s *GetDbDictService) getDbType() (string, error) {
	// 获取DB类型
	type dbTypeResult struct {
		DbType string `json:"db_type"`
	}
	var result dbTypeResult
	r := global.App.DB.Table("`insight_db_config` a").
		Select("a.`db_type`").
		Where("a.instance_id=?", s.InstanceID).
		Take(&result)
	// 判断记录是否存在
	if errors.Is(r.Error, gorm.ErrRecordNotFound) {
		return "", fmt.Errorf("指定DB配置的记录不存在,错误信息:%s", r.Error.Error())
	}
	return result.DbType, nil
}

func (s *GetDbDictService) getDbDict(hostname string, port int) (data *[]map[string]interface{}, err error) {
	query := fmt.Sprintf(`
					select
						t.TABLE_NAME,
						t.TABLE_COMMENT,
						t.CREATE_TIME,
						group_concat(
							distinct concat_ws(
								'<b>',
								c.COLUMN_NAME,
								c.COLUMN_TYPE,
								if(c.IS_NULLABLE = 'NO', 'NOT NULL', 'NULL'),
								ifnull(c.COLUMN_DEFAULT, ''),
								ifnull(c.CHARACTER_SET_NAME, ''),
								ifnull(c.COLLATION_NAME, ''),
								ifnull(c.COLUMN_COMMENT, '')
							) separator '<a>'
						) as COLUMNS_INFO,
						group_concat(
							distinct concat_ws(
								'<b>',
								s.INDEX_NAME,
								if(s.NON_UNIQUE = 0, '唯一', '不唯一'),
								s.Cardinality,
								s.INDEX_TYPE,
								s.COLUMN_NAME
							) separator '<a>'
						) as INDEXES_INFO
					from
						COLUMNS c
						join TABLES t on c.TABLE_SCHEMA = t.TABLE_SCHEMA
						and c.TABLE_NAME = t.TABLE_NAME
						left join STATISTICS s on c.TABLE_SCHEMA = s.TABLE_SCHEMA
						and c.TABLE_NAME = s.TABLE_NAME
					where
						t.TABLE_SCHEMA = '%s'
					group by
						t.TABLE_NAME,
						t.TABLE_COMMENT,
						t.CREATE_TIME
				`, s.Schema)
	db := dao.DB{
		User:     global.App.Config.RemoteDB.UserName,
		Password: global.App.Config.RemoteDB.Password,
		Host:     hostname,
		Port:     port,
		Database: "information_schema",
		Params:   map[string]string{"group_concat_max_len": "1073741824"},
		Ctx:      s.C.Request.Context(),
	}

	_, data, err = db.Query(query)
	if err != nil {
		global.App.Log.Error(err.Error())
	}
	return data, err
}

func (s *GetDbDictService) Run() (responseData *[]map[string]interface{}, err error) {
	// 解析UUID
	uuid, err := s.parserUUID()
	if err != nil {
		return responseData, err
	}
	// 验证用户是否有指定schema的权限
	if err = s.validatePerms(uuid); err != nil {
		return responseData, err
	}
	// 获取DB配置
	hostname, port, err := s.getConfigFromInstanceID()
	if err != nil {
		return responseData, err
	}
	// 获取DB类型
	dbType, err := s.getDbType()
	if err != nil {
		return responseData, err
	}
	if strings.EqualFold(dbType, "mysql") || strings.EqualFold(dbType, "tidb") {
		return s.getDbDict(hostname, port)
	}
	return responseData, fmt.Errorf("%s不支持获取数据字典", dbType)
}
