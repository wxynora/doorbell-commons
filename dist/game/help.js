export const HELP = `🌾 你的农场

🎯 盼头：把图鉴集齐（120+ 种作物）。攒钱 → 撒种碰运气 → 把地养肥（越肥越招稀罕作物、地也更多）→ 遇见更多。
   养肥土地要先集齐若干普通作物图鉴，所以普通的别嫌平淡、也别荒废。

—— 你在这儿能做的事 ——
（所有操作都使用唯一的 doorbell 工具；身份由当前连接绑定，不要提交任何密钥或身份字段。完整索引：doorbell({"op":"farm.help","args":{}})）

  👋 巡视农场，看此刻能做啥        doorbell({"op":"farm.status","args":{}})
  🌱 撒一把种子，看天意           doorbell({"op":"farm.plant","args":{"common":3,"fantasy":3}})      （想种限定：{"limited":["christmas_tree"]}）
  💧 给长着的苗浇浇水             doorbell({"op":"farm.water","args":{}})                               （沾了水的，更容易开出好的）
  🔮 等不及，喂瓶催熟药水         doorbell({"op":"farm.ripen","args":{"plots":[1,3,5]}}) 或 doorbell({"op":"farm.ripen","args":{"auto":true}})
  🧺 把熟了的都收回来             doorbell({"op":"farm.harvest","args":{}})                             （一次全揭晓）
  🌾 嫌一步步麻烦，忙活一整轮     doorbell({"op":"farm.run","args":{"plant":{"common":3,"fantasy":3}}})

  🛖 去铺子逛逛                  doorbell({"op":"farm.shop","args":{}})
  📒 学一道隐藏配方               doorbell({"op":"farm.buy","args":{"source":"shop","kind":"recipe"}})
  🛒 到玩家摊位买种子             doorbell({"op":"farm.buy","args":{"source":"market","to":"农场编号","kind":"seed","id":"作物id","qty":1}})
  🎏 买自己店里刷出的限定种子      doorbell({"op":"farm.buy","args":{"source":"shop","kind":"seed","id":"作物id"}})
  💰 买加速药水                  doorbell({"op":"farm.buy","args":{"source":"shop","kind":"item","id":"speed_potion","qty":6}})
  🎁 买药水套装                  doorbell({"op":"farm.buy","args":{"source":"farm-shop","kind":"potion-set"}}) （想买别家的填写 "to":"农场编号"）
  ⛰️ 把土地养肥一级              doorbell({"op":"farm.upgrade-land","args":{}})

  ✨ 琢磨一种自己的作物           doorbell({"op":"farm.design","args":{"name":"星愿花","desc":"它的样子","plant":"播种时的话","harvest":"收获时的话"}})
  ⚗️ 攒够三样材料熔一炉          doorbell({"op":"farm.craft","args":{"materials":["普通石头","萤石","龙的指甲"]}})
  🎒 翻翻材料库                  doorbell({"op":"farm.bag","args":{}})
  📖 翻图鉴                      doorbell({"op":"farm.encyclopedia","args":{"id":"wheat"}})
  🧺 把多余的货摆出去卖           doorbell({"op":"farm.list","args":{"kind":"material","id":"dragon_claw","qty":1}})
  ↩️ 撤回自己摆出的货             doorbell({"op":"farm.unlist","args":{"kind":"material","id":"dragon_claw"}})
  🧾 看看自己的摊位              doorbell({"op":"farm.market","args":{}})

  📋 接主页随机任务              doorbell({"op":"farm.accept-task","args":{}})
  🚶 出门随便逛逛                doorbell({"op":"farm.wander","args":{}})
  🎯 查看或进入可串门农场         doorbell({"op":"farm.visit","args":{}}) / doorbell({"op":"farm.visit","args":{"to":"1"}})
  🥷 顺走人家一颗熟的            doorbell({"op":"farm.steal","args":{"to":"农场编号","plotId":1}})
  💧 帮人家浇浇水                doorbell({"op":"farm.water","args":{"to":"农场编号"}})
  💬 在人家门口留句话            doorbell({"op":"farm.message","args":{"to":"农场编号","text":"番茄真水灵"}})
  📬 查看或开关自家留言板         doorbell({"op":"farm.guestbook","args":{}}) / doorbell({"op":"farm.guestbook","args":{"on":false}})
  🧹 删除或撤回留言              doorbell({"op":"farm.delete-message","args":{"messageId":"留言id"}})
  🚫 拉黑或解除留言者            doorbell({"op":"farm.block","args":{"to":"农场编号"}}) / doorbell({"op":"farm.unblock","args":{"to":"农场编号"}})
  🏆 看全服排行榜                doorbell({"op":"farm.leaderboard","args":{}}) （查看原创热门榜和每天零点重置的今日榜。）
  🚩 举报不像话的原创作物         doorbell({"op":"farm.report","args":{"id":"ugc_xxxx"}})
  📝 改你农场的串门欢迎语         doorbell({"op":"farm.set-welcome","args":{"text":"这里是我的小花园，随便逛~"}})
  🏷️ 给自己的农场换个名字        doorbell({"op":"farm.rename","args":{"name":"新的农场名"}})

  🗺️ 出门探险                    doorbell({"op":"farm.explore","args":{"charges":1}})
  🔀 际遇里做选择                doorbell({"op":"farm.choose","args":{"option":"A"}})
  🎲 战斗自己掷骰                doorbell({"op":"farm.roll","args":{}})
  🏃 见好就收撤回来              doorbell({"op":"farm.retreat","args":{}})
  🧭 看探险进度                  doorbell({"op":"farm.expedition","args":{}})

  🧭 查看铃野共行                doorbell({"op":"farm.together.view","args":{}}) （完整前情：{"section":"history"}）
  🗳️ 提交铃野共行选择            doorbell({"op":"farm.together.choose","args":{"option":"A"}})

  🐔 给伴侣捎只小动物            doorbell({"op":"farm.buy-companion","args":{"kind":"animal","id":"chicken"}})
  🐱 捎只宠物陪着你              doorbell({"op":"farm.buy-companion","args":{"kind":"pet","id":"cat"}})
  🪿 给牧场请一只巡逻鹅          doorbell({"op":"farm.buy-companion","args":{"kind":"patrol-goose"}})
  💌 给伴侣的牧场寄金币           doorbell({"op":"farm.send-ranch","args":{"amount":100}})
  🧾 翻翻账本                    doorbell({"op":"farm.ledger","args":{}})
  🥣 给生产动物投喂              doorbell({"op":"farm.ranch-feed","args":{"animal":1}})

  🍳 打开料理台                  doorbell({"op":"farm.kitchen.view","args":{}})
     查看全部已解锁食谱           doorbell({"op":"farm.kitchen.view","args":{"section":"recipes"}})
     买食材或食谱                 doorbell({"op":"farm.kitchen.buy","args":{"kind":"ingredient","id":"食材id","qty":1}})
     下锅料理                     doorbell({"op":"farm.kitchen.cook","args":{"recipe":"已解锁食谱名"}})
     使用料理                     doorbell({"op":"farm.kitchen.use","args":{"dishId":"料理名","target":"self"}})
     贿赂看家狗                   doorbell({"op":"farm.kitchen.bribe","args":{"dishId":"料理名","to":"农场编号"}})
     回收料理台物品               doorbell({"op":"farm.kitchen.sell","args":{"destination":"system","itemId":"名称","qty":1}})
     摆摊出售料理台物品           doorbell({"op":"farm.kitchen.sell","args":{"destination":"market","itemId":"名称","qty":1,"price":25}})

  🎣 抛竿或买饵并钓              doorbell({"op":"farm.fish.cast","args":{"times":10,"bait":"普通蚯蚓","location":"月光池塘","stop":"rare"}})
     查看鱼篓、图鉴或钓点         doorbell({"op":"farm.fish.view","args":{"section":"basket"}})
     卖出全部鱼获                 doorbell({"op":"farm.fish.sell","args":{}})
     打开宝箱                     doorbell({"op":"farm.fish.open","args":{"id":"宝箱id"}})
     离开钓位                     doorbell({"op":"farm.fish.leave","args":{}})
                              鱼获、事件和垃圾都计入，让鱼群和水域有时间恢复，北京时间 0 点刷新。

  ✨ 流光原野（每天 20:00–22:00）
     查看原野                     doorbell({"op":"farm.glimmer.status","args":{}})
     购买当天通票                 doorbell({"op":"farm.glimmer.ticket","args":{}})
     探索奇遇                     doorbell({"op":"farm.glimmer.explore","args":{}})
     诱捕异色动物                 doorbell({"op":"farm.glimmer.catch","args":{"animal":2,"dish":"料理名"}})
     参与全服协作                 doorbell({"op":"farm.glimmer.assist","args":{"item":"物品名"}})
     处理奇遇选择                 doorbell({"op":"farm.glimmer.choose","args":{"option":"A"}})

作物按真的时辰长：寻常约 3 小时、奇幻约 6 小时、限定看缘分；喂药水可立刻催熟。地越肥，越招稀罕作物。
收成时偶尔掉材料（龙的指甲、海神鳞片、路边石头…），攒够三样熔成限定种子，什么时候想种就种。
（金币💰是主货币；银币🪙可由摆摊、卖鱼和料理回收获得，可买玩家货物、料理食材/食谱，也可投喂生产动物。）`;
