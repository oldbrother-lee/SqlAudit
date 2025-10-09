/*
@Time    :   2023/08/14 15:45:43
@Author  :   xff
*/

package bootstrap

import (
	"fmt"
	"goInsight/global"

	"github.com/spf13/viper"
)

func InitializeConfig(config string) *viper.Viper {
	// 初始化viper
	v := viper.New()
	v.SetConfigFile(config)
	v.SetConfigType("yaml")
	if err := v.ReadInConfig(); err != nil {
		panic(fmt.Errorf("read config failed: %s", err))
	}
	// 将配置赋值给全局变量
	if err := v.Unmarshal(&global.App.Config); err != nil {
		fmt.Println(err)
	}

	return v
}
