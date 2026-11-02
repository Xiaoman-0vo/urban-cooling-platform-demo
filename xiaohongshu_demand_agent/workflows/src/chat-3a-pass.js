// 聊天窗 3a2：快照读到了，把 3a 的排版结果原样往下传
// 为什么需要这个节点：If 节点自己的输出没有 output 字段，聊天窗（responseMode=lastNode）会显示空消息。
// 它不是逻辑，只是一次"搬运"。
return [{ json: $('3a-汇总').first().json }];
