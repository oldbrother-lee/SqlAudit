package base

import (
	"context"
	"goInsight/global"
	"goInsight/pkg/utils"
)

// PublishMessageToChannel publishes a message to a specified channel with a given render type.
func PublishMessageToChannel(channel string, data interface{}, renderType string) {
	// 发送消息
	err := utils.Publish(context.Background(), channel, data, renderType)
	if err != nil {
		global.App.Log.Error(err)
	}
}
