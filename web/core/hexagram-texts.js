/**
 * 卦象心音 · 六十四卦详解数据层
 * ---------------------------------------------------------------
 * 本文件由 scripts/build-hex-texts.js 自动生成，请勿手工编辑。
 *
 * 内容分三等出处，与 core/classics.js 的标注口径一致：
 *   classic  卦辞、彖传、大象传、六爻爻辞、六爻小象、用九用六
 *            —— 抓自 ctext.org「周易·易經」各卦页（公有领域古籍），繁体转简体。
 *   later    京房八宫、纳甲干支、六亲、二十四山山向
 *            —— 依京氏易法算法计算，歌诀与规则见 scripts/build-hex-texts.js 注释。
 *   modern   常见占断（div）—— 依卦辞卦性所作的当代类推，非吉凶断定。
 *
 * 严守两条底线：
 *   1. 阳宅部分只列方位与山向配属（算法可查），不给吉凶断语。
 *   2. 占断一律标 modern，不作转运、预测之断。
 */

'use strict';

/* __IC_IIFE__ */
(function () {

/* 六十四卦：卦辞、彖传、大象传、六爻爻辞与小象、用九用六 */
const HEXAGRAM_TEXTS = [
   {
    "n": 1,
    "name": "乾为天",
    "sym": "䷀",
    "gua": "干：元亨，利贞。",
    "tuan": "大哉乾元，万物资始，乃统天。云行雨施，品物流形。大明始终，六位时成，时乘六龙以御天。乾道变化，各正性命，保合大和，乃利贞。首出庶物，万国咸宁。",
    "xiang": "天行健，君子以自强不息。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "潜龙，勿用。",
      "xiang": "潜龙勿用，阳在下也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "甲子",
      "liuqin": "妻财",
      "dir": "正北"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "见龙在田，利见大人。",
      "xiang": "见龙在田，德施普也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "甲寅",
      "liuqin": "妻财",
      "dir": "东北"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "君子终日干干，夕惕若，厉，无咎。",
      "xiang": "终日干干，反复道也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "甲辰",
      "liuqin": "妻财",
      "dir": "东南"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "或跃在渊，无咎。",
      "xiang": "或跃在渊，进无咎也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "壬午",
      "liuqin": "子孙",
      "dir": "正南"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "飞龙在天，利见大人。",
      "xiang": "飞龙在天，大人造也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "壬申",
      "liuqin": "子孙",
      "dir": "西南"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "亢龙有悔。",
      "xiang": "亢龙有悔，盈不可久也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "壬戌",
      "liuqin": "子孙",
      "dir": "西北"
     }
    ],
    "yong": "用九：见群龙无首，吉。"
   },
   {
    "n": 2,
    "name": "坤为地",
    "sym": "䷁",
    "gua": "坤：元亨，利牝马之贞。君子有攸往，先迷后得主，利西南得朋，东北丧朋。安贞，吉。",
    "tuan": "至哉坤元，万物资生，乃顺承天。坤厚载物，德合无疆。含弘光大，品物咸亨。牝马地类，行地无疆，柔顺利贞。君子攸行，先迷失道，后顺得常。西南得朋，乃与类行；东北丧朋，乃终有庆。安贞之吉，应地无疆。",
    "xiang": "地势坤，君子以厚德载物。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "履霜，坚冰至。",
      "xiang": "履霜坚冰，阴始凝也。驯致其道，至坚冰也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "乙未",
      "liuqin": "官鬼",
      "dir": "西南"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "直，方，大，不习无不利。",
      "xiang": "六二之动，直以方也。不习无不利，地道光也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "乙巳",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "含章可贞。或从王事，无成有终。",
      "xiang": "含章可贞；以时发也。或从王事，知光大也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "乙卯",
      "liuqin": "官鬼",
      "dir": "正东"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "括囊；无咎，无誉。",
      "xiang": "括囊无咎，慎不害也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "癸丑",
      "liuqin": "妻财",
      "dir": "东北"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "黄裳，元吉。",
      "xiang": "黄裳元吉，文在中也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "癸亥",
      "liuqin": "妻财",
      "dir": "西北"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "龙战于野，其血玄黄。",
      "xiang": "战龙于野，其道穷也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "癸酉",
      "liuqin": "妻财",
      "dir": "正西"
     }
    ],
    "yong": "用六：利永贞。"
   },
   {
    "n": 3,
    "name": "水雷屯",
    "sym": "䷂",
    "gua": "屯：元亨，利贞，勿用有攸往，利建侯。",
    "tuan": "屯，刚柔始交而难生，动乎险中，大亨贞。雷雨之动满盈，天造草昧，宜建侯而不宁。",
    "xiang": "云，雷，屯；君子以经纶。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "磐桓；利居贞，利建侯。",
      "xiang": "虽磐桓，志行正也。以贵下贱，大得民也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚子",
      "liuqin": "父母",
      "dir": "正北"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "屯如邅如，乘马班如。匪寇婚媾，女子贞不字，十年乃字。",
      "xiang": "六二之难，乘刚也。十年乃字，反常也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "庚寅",
      "liuqin": "父母",
      "dir": "东北"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "即鹿无虞，惟入于林中，君子几不如舍，往吝。",
      "xiang": "即鹿无虞，以纵禽也。君子舍之，往吝穷也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚辰",
      "liuqin": "父母",
      "dir": "东南"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "乘马班如，求婚媾，往吉，无不利。",
      "xiang": "求而往，明也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊申",
      "liuqin": "官鬼",
      "dir": "西南"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "屯其膏，小贞吉，大贞凶。",
      "xiang": "屯其膏，施未光也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "戊戌",
      "liuqin": "官鬼",
      "dir": "西北"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "乘马班如，泣血涟如。",
      "xiang": "泣血涟如，何可长也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊子",
      "liuqin": "官鬼",
      "dir": "正北"
     }
    ],
    "yong": ""
   },
   {
    "n": 4,
    "name": "山水蒙",
    "sym": "䷃",
    "gua": "蒙：亨。匪我求童蒙，童蒙求我。初筮告，再三渎，渎则不告。利贞。",
    "tuan": "蒙，山下有险，险而止，蒙。蒙亨，以亨行时中也。匪我求童蒙，童蒙求我，志应也。初噬告，以刚中也。再三渎，渎则不告，渎蒙也。蒙以养正，圣功也。",
    "xiang": "山下出泉，蒙；君子以果行育德。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "发蒙，利用刑人，用说桎梏，以往吝。",
      "xiang": "利用刑人，以正法也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "戊寅",
      "liuqin": "子孙",
      "dir": "东北"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "包蒙吉；纳妇吉；子克家。",
      "xiang": "子克家，刚柔接也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊辰",
      "liuqin": "子孙",
      "dir": "东南"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "勿用取女；见金夫，不有躬，无攸利。",
      "xiang": "勿用取女，行不顺也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊午",
      "liuqin": "子孙",
      "dir": "正南"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "困蒙，吝。",
      "xiang": "困蒙之吝，独远实也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "丙戌",
      "liuqin": "兄弟",
      "dir": "西北"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "童蒙，吉。",
      "xiang": "童蒙之吉，顺以巽也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙子",
      "liuqin": "兄弟",
      "dir": "正北"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "击蒙；不利为寇，利御寇。",
      "xiang": "利用御寇，上下顺也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙寅",
      "liuqin": "兄弟",
      "dir": "东北"
     }
    ],
    "yong": ""
   },
   {
    "n": 5,
    "name": "水天需",
    "sym": "䷄",
    "gua": "需：有孚，光亨，贞吉。利涉大川。",
    "tuan": "需，须也；险在前也。刚健而不陷，其义不困穷矣。需有孚，光亨，贞吉。位乎天位，以正中也。利涉大川，往有功也。",
    "xiang": "云上于天，需；君子以饮食宴乐。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "需于郊。利用恒，无咎。",
      "xiang": "需于郊，不犯难行也。利用恒，无咎；未失常也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "甲子",
      "liuqin": "官鬼",
      "dir": "正北"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "需于沙。小有言，终吉。",
      "xiang": "需于沙，衍在中也。虽小有言，以终吉也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "甲寅",
      "liuqin": "官鬼",
      "dir": "东北"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "需于泥，致寇至。",
      "xiang": "需于泥，灾在外也。自我致寇，敬慎不败也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "甲辰",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "需于血，出自穴。",
      "xiang": "需于血，顺以听也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "戊申",
      "liuqin": "兄弟",
      "dir": "西南"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "需于酒食，贞吉。",
      "xiang": "酒食贞吉，以中正也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊戌",
      "liuqin": "兄弟",
      "dir": "西北"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "入于穴，有不速之客三人来，敬之终吉。",
      "xiang": "不速之客来，敬之终吉。虽不当位，未大失也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊子",
      "liuqin": "兄弟",
      "dir": "正北"
     }
    ],
    "yong": ""
   },
   {
    "n": 6,
    "name": "天水讼",
    "sym": "䷅",
    "gua": "讼：有孚，窒。惕中吉。终凶。利见大人，不利涉大川。",
    "tuan": "讼，上刚下险，险而健讼。讼有孚窒，惕中吉，刚来而得中也。终凶；讼不可成也。利见大人；尚中正也。不利涉大川；入于渊也。",
    "xiang": "天与水违行，讼；君子以作事谋始。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "不永所事，小有言，终吉。",
      "xiang": "不永所事，讼不可长也。虽有小言，其辩明也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "戊寅",
      "liuqin": "子孙",
      "dir": "东北"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "不克讼，归而逋，其邑人三百户，无眚。",
      "xiang": "不克讼，归而逋也。自下讼上，患至掇也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊辰",
      "liuqin": "子孙",
      "dir": "东南"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "食旧德，贞厉，终吉，或从王事，无成。",
      "xiang": "食旧德，从上吉也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊午",
      "liuqin": "子孙",
      "dir": "正南"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "不克讼，复即命渝，安贞吉。",
      "xiang": "复即命，渝安贞；不失也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "壬午",
      "liuqin": "官鬼",
      "dir": "正南"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "讼元吉。",
      "xiang": "讼元吉，以中正也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "壬申",
      "liuqin": "官鬼",
      "dir": "西南"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "或锡之鞶带，终朝三褫之。",
      "xiang": "以讼受服，亦不足敬也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "壬戌",
      "liuqin": "官鬼",
      "dir": "西北"
     }
    ],
    "yong": ""
   },
   {
    "n": 7,
    "name": "地水师",
    "sym": "䷆",
    "gua": "师：贞，丈人，吉无咎。",
    "tuan": "师，众也，贞正也，能以众正，可以王矣。刚中而应，行险而顺，以此毒天下，而民从之，吉又何咎矣。",
    "xiang": "地中有水，师；君子以容民畜众。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "师出以律，否臧凶。",
      "xiang": "师出以律，失律凶也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊寅",
      "liuqin": "官鬼",
      "dir": "东北"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "在师中吉，无咎，王三锡命。",
      "xiang": "在师中吉，承天宠也。王三锡命，怀万邦也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊辰",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "师或舆尸，凶。",
      "xiang": "师或舆尸，大无功也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "戊午",
      "liuqin": "官鬼",
      "dir": "正南"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "师左次，无咎。",
      "xiang": "左次无咎，未失常也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "癸丑",
      "liuqin": "兄弟",
      "dir": "东北"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "田有禽，利执言，无咎。长子帅师，弟子舆尸，贞凶。",
      "xiang": "长子帅师，以中行也。弟子舆尸，使不当也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "癸亥",
      "liuqin": "兄弟",
      "dir": "西北"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "大君有命，开国承家，小人勿用。",
      "xiang": "大君有命，以正功也。小人勿用，必乱邦也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "癸酉",
      "liuqin": "兄弟",
      "dir": "正西"
     }
    ],
    "yong": ""
   },
   {
    "n": 8,
    "name": "水地比",
    "sym": "䷇",
    "gua": "比：吉。原筮元永贞，无咎。不宁方来，后夫凶。",
    "tuan": "比，吉也，比，辅也，下顺从也。原筮元永贞，无咎，以刚中也。不宁方来，上下应也。后夫凶，其道穷也。",
    "xiang": "地上有水，比；先王以建万国，亲诸侯。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "有孚，比之，无咎。有孚盈缶，终来有它吉。",
      "xiang": "比之初六，有他吉也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "乙未",
      "liuqin": "官鬼",
      "dir": "西南"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "比之自内，贞吉。",
      "xiang": "比之自内，不自失也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "乙巳",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "比之匪人。",
      "xiang": "比之匪人，不亦伤乎！",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "乙卯",
      "liuqin": "官鬼",
      "dir": "正东"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "外比之，贞吉。",
      "xiang": "外比于贤，以从上也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊申",
      "liuqin": "兄弟",
      "dir": "西南"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "显比，王用三驱，失前禽。邑人不诫，吉。",
      "xiang": "显比之吉，位正中也。舍逆取顺，失前禽也。邑人不诫，上使中也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊戌",
      "liuqin": "兄弟",
      "dir": "西北"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "比之无首，凶。",
      "xiang": "比之无首，无所终也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "戊子",
      "liuqin": "兄弟",
      "dir": "正北"
     }
    ],
    "yong": ""
   },
   {
    "n": 9,
    "name": "风天小畜",
    "sym": "䷈",
    "gua": "小畜：亨。密云不雨，自我西郊。",
    "tuan": "小畜，柔得位，而上下应之，曰小畜。健而巽，刚中而志行，乃亨。密云不雨，尚往也。自我西郊，施未行也。",
    "xiang": "风行天上，小畜；君子以懿文德。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "复自道，何其咎，吉。",
      "xiang": "复自道，其义吉也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "甲子",
      "liuqin": "兄弟",
      "dir": "正北"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "牵复，吉。",
      "xiang": "牵复在中，亦不自失也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "甲寅",
      "liuqin": "兄弟",
      "dir": "东北"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "舆说辐，夫妻反目。",
      "xiang": "夫妻反目，不能正室也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "甲辰",
      "liuqin": "兄弟",
      "dir": "东南"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "有孚，血去惕出，无咎。",
      "xiang": "有孚惕出，上合志也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "辛未",
      "liuqin": "官鬼",
      "dir": "西南"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "有孚挛如，富以其邻。",
      "xiang": "有孚挛如，不独富也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛酉",
      "liuqin": "官鬼",
      "dir": "正西"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "既雨既处，尚德载，妇贞厉。月几望，君子征凶。",
      "xiang": "既雨既处，德积载也。君子征凶，有所疑也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛亥",
      "liuqin": "官鬼",
      "dir": "西北"
     }
    ],
    "yong": ""
   },
   {
    "n": 10,
    "name": "天泽履",
    "sym": "䷉",
    "gua": "履虎尾，不咥人，亨。",
    "tuan": "履，柔履刚也。说而应乎干，是以履虎尾，不咥人，亨。刚中正，履帝位而不疚，光明也。",
    "xiang": "上天下泽，履；君子以辨上下，安民志。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "素履，往无咎。",
      "xiang": "素履之往，独行愿也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁巳",
      "liuqin": "父母",
      "dir": "东南"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "履道坦坦，幽人贞吉。",
      "xiang": "幽人贞吉，中不自乱也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "丁卯",
      "liuqin": "父母",
      "dir": "正东"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "眇能视，跛能履，履虎尾，咥人，凶。武人为于大君。",
      "xiang": "眇能视；不足以有明也。跛能履；不足以与行也，咥人之凶；位不当也。武人为于大君；志刚也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁丑",
      "liuqin": "父母",
      "dir": "东北"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "履虎尾，愬愬，终吉。",
      "xiang": "愬愬终吉，志行也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "壬午",
      "liuqin": "妻财",
      "dir": "正南"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "夬履，贞厉。",
      "xiang": "夬履贞厉，位正当也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "壬申",
      "liuqin": "妻财",
      "dir": "西南"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "视履考祥，其旋元吉。",
      "xiang": "元吉在上，大有庆也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "壬戌",
      "liuqin": "妻财",
      "dir": "西北"
     }
    ],
    "yong": ""
   },
   {
    "n": 11,
    "name": "地天泰",
    "sym": "䷊",
    "gua": "泰：小往大来，吉亨。",
    "tuan": "泰，小往大来，吉亨。则是天地交，而万物通也；上下交，而其志同也。内阳而外阴，内健而外顺，内君子而外小人，君子道长，小人道消也。",
    "xiang": "天地交泰，后以财成天地之道，辅相天地之宜，以左右民。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "拔茅茹，以其汇，征吉。",
      "xiang": "拔茅征吉，志在外也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "甲子",
      "liuqin": "官鬼",
      "dir": "正北"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "包荒，用冯河，不遐遗，朋亡，得尚于中行。",
      "xiang": "包荒，得尚于中行，以光大也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "甲寅",
      "liuqin": "官鬼",
      "dir": "东北"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "无平不陂，无往不复，艰贞无咎。勿恤其孚，于食有福。",
      "xiang": "无往不复，天地际也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "甲辰",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "翩翩，不富，以其邻，不戒以孚。",
      "xiang": "翩翩不富，皆失实也。不戒以孚，中心愿也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "癸丑",
      "liuqin": "妻财",
      "dir": "东北"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "帝乙归妹，以祉元吉。",
      "xiang": "以祉元吉，中以行愿也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "癸亥",
      "liuqin": "妻财",
      "dir": "西北"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "城复于隍，勿用师。自邑告命，贞吝。",
      "xiang": "城复于隍，其命乱也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "癸酉",
      "liuqin": "妻财",
      "dir": "正西"
     }
    ],
    "yong": ""
   },
   {
    "n": 12,
    "name": "天地否",
    "sym": "䷋",
    "gua": "否之匪人，不利君子贞，大往小来。",
    "tuan": "否之匪人，不利君子贞。大往小来，则是天地不交，而万物不通也；上下不交，而天下无邦也。内阴而外阳，内柔而外刚，内小人而外君子。小人道长，君子道消也。",
    "xiang": "天地不交，否；君子以俭德辟难，不可荣以禄。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "拔茅茹，以其汇，贞吉亨。",
      "xiang": "拔茅贞吉，志在君也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "乙未",
      "liuqin": "妻财",
      "dir": "西南"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "包承。小人吉，大人否，亨。",
      "xiang": "大人否亨，不乱群也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "乙巳",
      "liuqin": "妻财",
      "dir": "东南"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "包羞。",
      "xiang": "包羞，位不当也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "乙卯",
      "liuqin": "妻财",
      "dir": "正东"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "有命，无咎，畴离祉。",
      "xiang": "有命无咎，志行也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "壬午",
      "liuqin": "子孙",
      "dir": "正南"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "休否，大人吉。其亡其亡，系于苞桑。",
      "xiang": "大人之吉，位正当也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "壬申",
      "liuqin": "子孙",
      "dir": "西南"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "倾否，先否后喜。",
      "xiang": "否终则倾，何可长也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "壬戌",
      "liuqin": "子孙",
      "dir": "西北"
     }
    ],
    "yong": ""
   },
   {
    "n": 13,
    "name": "天火同人",
    "sym": "䷌",
    "gua": "同人于野，亨。利涉大川，利君子贞。",
    "tuan": "同人，柔得位得中，而应乎干，曰同人。同人曰，同人于野，亨。利涉大川，干行也。文明以健，中正而应，君子正也。唯君子为能通天下之志。",
    "xiang": "天与火，同人；君子以类族辨物。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "同人于门，无咎。",
      "xiang": "出门同人，又谁咎也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己卯",
      "liuqin": "子孙",
      "dir": "正东"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "同人于宗，吝。",
      "xiang": "同人于宗，吝道也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己巳",
      "liuqin": "子孙",
      "dir": "东南"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "伏戎于莽，升其高陵，三岁不兴。",
      "xiang": "伏戎于莽，敌刚也。三岁不兴，安行也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "己未",
      "liuqin": "子孙",
      "dir": "西南"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "乘其墉，弗克攻，吉。",
      "xiang": "乘其墉，义弗克也，其吉，则困而反则也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "壬午",
      "liuqin": "官鬼",
      "dir": "正南"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "同人，先号咷而后笑。大师克相遇。",
      "xiang": "同人之先，以中直也。大师相遇，言相克也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "壬申",
      "liuqin": "官鬼",
      "dir": "西南"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "同人于郊，无悔。",
      "xiang": "同人于郊，志未得也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "壬戌",
      "liuqin": "官鬼",
      "dir": "西北"
     }
    ],
    "yong": ""
   },
   {
    "n": 14,
    "name": "火天大有",
    "sym": "䷍",
    "gua": "大有：元亨。",
    "tuan": "大有，柔得尊位，大中而上下应之，曰大有。其德刚健而文明，应乎天而时行，是以元亨。",
    "xiang": "火在天上，大有；君子以遏恶扬善，顺天休命。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "无交害，匪咎，艰则无咎。",
      "xiang": "大有初九，无交害也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "甲子",
      "liuqin": "妻财",
      "dir": "正北"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "大车以载，有攸往，无咎。",
      "xiang": "大车以载，积中不败也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "甲寅",
      "liuqin": "妻财",
      "dir": "东北"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "公用亨于天子，小人弗克。",
      "xiang": "公用亨于天子，小人害也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "甲辰",
      "liuqin": "妻财",
      "dir": "东南"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "匪其彭，无咎。",
      "xiang": "匪其彭，无咎；明辨晰也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己酉",
      "liuqin": "父母",
      "dir": "正西"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "厥孚交如，威如；吉。",
      "xiang": "厥孚交如，信以发志也。威如之吉，易而无备也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己亥",
      "liuqin": "父母",
      "dir": "西北"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "自天祐之，吉无不利。",
      "xiang": "大有上吉，自天佑也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "己丑",
      "liuqin": "父母",
      "dir": "东北"
     }
    ],
    "yong": ""
   },
   {
    "n": 15,
    "name": "地山谦",
    "sym": "䷎",
    "gua": "谦：亨，君子有终。",
    "tuan": "谦，亨，天道下济而光明，地道卑而上行。天道亏盈而益谦，地道变盈而流谦，鬼神害盈而福谦，人道恶盈而好谦。谦尊而光，卑而不可逾，君子之终也。",
    "xiang": "地中有山，谦；君子以裒多益寡，称物平施。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "谦谦君子，用涉大川，吉。",
      "xiang": "谦谦君子，卑以自牧也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙辰",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "鸣谦，贞吉。",
      "xiang": "鸣谦贞吉，中心得也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "丙午",
      "liuqin": "官鬼",
      "dir": "正南"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "劳谦，君子有终，吉。",
      "xiang": "劳谦君子，万民服也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙申",
      "liuqin": "官鬼",
      "dir": "西南"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "无不利，㧑谦。",
      "xiang": "无不利，㧑谦；不违则也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "癸丑",
      "liuqin": "子孙",
      "dir": "东北"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "不富，以其邻，利用侵伐，无不利。",
      "xiang": "利用侵伐，征不服也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "癸亥",
      "liuqin": "子孙",
      "dir": "西北"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "鸣谦，利用行师，征邑国。",
      "xiang": "鸣谦，志未得也。可用行师，征邑国也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "癸酉",
      "liuqin": "子孙",
      "dir": "正西"
     }
    ],
    "yong": ""
   },
   {
    "n": 16,
    "name": "雷地豫",
    "sym": "䷏",
    "gua": "豫：利建侯，行师。",
    "tuan": "豫，刚应而志行，顺以动，豫。豫，顺以动，故天地如之，而况建侯行师乎？天地以顺动，故日月不过，而四时不忒；圣人以顺动，则刑罚清而民服。豫之时义大矣哉！",
    "xiang": "雷出地奋，豫。先王以作乐崇德，殷荐之上帝，以配祖考。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "鸣豫，凶。",
      "xiang": "初六鸣豫，志穷凶也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "乙未",
      "liuqin": "兄弟",
      "dir": "西南"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "介于石，不终日，贞吉。",
      "xiang": "不终日，贞吉；以中正也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "乙巳",
      "liuqin": "兄弟",
      "dir": "东南"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "盱豫，悔。迟有悔。",
      "xiang": "盱豫有悔，位不当也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "乙卯",
      "liuqin": "兄弟",
      "dir": "正东"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "由豫，大有得。勿疑。朋盍簪。",
      "xiang": "由豫，大有得；志大行也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "庚午",
      "liuqin": "官鬼",
      "dir": "正南"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "贞疾，恒不死。",
      "xiang": "六五贞疾，乘刚也。恒不死，中未亡也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚申",
      "liuqin": "官鬼",
      "dir": "西南"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "冥豫，成有渝，无咎。",
      "xiang": "冥豫在上，何可长也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚戌",
      "liuqin": "官鬼",
      "dir": "西北"
     }
    ],
    "yong": ""
   },
   {
    "n": 17,
    "name": "泽雷随",
    "sym": "䷐",
    "gua": "随：元亨利贞，无咎。",
    "tuan": "随，刚来而下柔，动而说，随。大亨贞，无咎，而天下随时，随时之义大矣哉！",
    "xiang": "泽中有雷，随；君子以向晦入宴息。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "官有渝，贞吉。出门交有功。",
      "xiang": "官有渝，从正吉也。出门交有功，不失也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚子",
      "liuqin": "官鬼",
      "dir": "正北"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "系小子，失丈夫。",
      "xiang": "系小子，弗兼与也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚寅",
      "liuqin": "官鬼",
      "dir": "东北"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "系丈夫，失小子。随有求得，利居贞。",
      "xiang": "系丈夫，志舍下也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "庚辰",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "随有获，贞凶。有孚在道，以明，何咎。",
      "xiang": "随有获，其义凶也。有孚在道，明功也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁亥",
      "liuqin": "子孙",
      "dir": "西北"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "孚于嘉，吉。",
      "xiang": "孚于嘉，吉；位正中也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁酉",
      "liuqin": "子孙",
      "dir": "正西"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "拘系之，乃从维之。王用亨于西山。",
      "xiang": "拘系之，上穷也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "丁未",
      "liuqin": "子孙",
      "dir": "西南"
     }
    ],
    "yong": ""
   },
   {
    "n": 18,
    "name": "山风蛊",
    "sym": "䷑",
    "gua": "蛊：元亨，利涉大川。先甲三日，后甲三日。",
    "tuan": "蛊，刚上而柔下，巽而止，蛊。蛊，元亨，而天下治也。利涉大川，往有事也。先甲三日，后甲三日，终则有始，天行也。",
    "xiang": "山下有风，蛊；君子以振民育德。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "干父之蛊，有子，考无咎，厉终吉。",
      "xiang": "干父之蛊，意承考也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛丑",
      "liuqin": "官鬼",
      "dir": "东北"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "干母之蛊，不可贞。",
      "xiang": "干母之蛊，得中道也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛卯",
      "liuqin": "官鬼",
      "dir": "正东"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "干父之蛊，小有悔，无大咎。",
      "xiang": "干父之蛊，终无咎也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "辛巳",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "裕父之蛊，往见吝。",
      "xiang": "裕父之蛊，往未得也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙戌",
      "liuqin": "子孙",
      "dir": "西北"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "干父之蛊，用誉。",
      "xiang": "干父之蛊；承以德也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙子",
      "liuqin": "子孙",
      "dir": "正北"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "不事王侯，高尚其事。",
      "xiang": "不事王侯，志可则也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "丙寅",
      "liuqin": "子孙",
      "dir": "东北"
     }
    ],
    "yong": ""
   },
   {
    "n": 19,
    "name": "地泽临",
    "sym": "䷒",
    "gua": "临：元，亨，利，贞。至于八月有凶。",
    "tuan": "临，刚浸而长。说而顺，刚中而应，大亨以正，天之道也。至于八月有凶，消不久也。",
    "xiang": "泽上有地，临；君子以教思无穷，容保民无疆。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "咸临，贞吉。",
      "xiang": "咸临贞吉，志行正也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁巳",
      "liuqin": "父母",
      "dir": "东南"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "咸临，吉无不利。",
      "xiang": "咸临，吉无不利；未顺命也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "丁卯",
      "liuqin": "父母",
      "dir": "正东"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "甘临，无攸利。既忧之，无咎。",
      "xiang": "甘临，位不当也。既忧之，咎不长也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁丑",
      "liuqin": "父母",
      "dir": "东北"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "至临，无咎。",
      "xiang": "至临无咎，位当也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "癸丑",
      "liuqin": "妻财",
      "dir": "东北"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "知临，大君之宜，吉。",
      "xiang": "大君之宜，行中之谓也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "癸亥",
      "liuqin": "妻财",
      "dir": "西北"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "敦临，吉无咎。",
      "xiang": "敦临之吉，志在内也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "癸酉",
      "liuqin": "妻财",
      "dir": "正西"
     }
    ],
    "yong": ""
   },
   {
    "n": 20,
    "name": "风地观",
    "sym": "䷓",
    "gua": "观：盥而不荐，有孚颙若。",
    "tuan": "大观在上，顺而巽，中正以观天下。观，盥而不荐，有孚颙若，下观而化也。观天之神道，而四时不忒，圣人以神道设教，而天下服矣。",
    "xiang": "风行地上，观；先王以省方，观民设教。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "童观，小人无咎，君子吝。",
      "xiang": "初六童观，小人道也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "乙未",
      "liuqin": "妻财",
      "dir": "西南"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "闚观，利女贞。",
      "xiang": "窥观女贞，亦可丑也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "乙巳",
      "liuqin": "妻财",
      "dir": "东南"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "观我生，进退。",
      "xiang": "观我生，进退；未失道也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "乙卯",
      "liuqin": "妻财",
      "dir": "正东"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "观国之光，利用宾于王。",
      "xiang": "观国之光，尚宾也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "辛未",
      "liuqin": "兄弟",
      "dir": "西南"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "观我生，君子无咎。",
      "xiang": "观我生，观民也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛酉",
      "liuqin": "兄弟",
      "dir": "正西"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "观其生，君子无咎。",
      "xiang": "观其生，志未平也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛亥",
      "liuqin": "兄弟",
      "dir": "西北"
     }
    ],
    "yong": ""
   },
   {
    "n": 21,
    "name": "火雷噬嗑",
    "sym": "䷔",
    "gua": "噬嗑：亨。利用狱。",
    "tuan": "颐中有物，曰噬嗑，噬嗑而亨。刚柔分，动而明，雷电合而章。柔得中而上行，虽不当位，利用狱也。",
    "xiang": "雷电噬嗑；先王以明罚敕法。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "屦校灭趾，无咎。",
      "xiang": "屦校灭趾，不行也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚子",
      "liuqin": "官鬼",
      "dir": "正北"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "噬肤灭鼻，无咎。",
      "xiang": "噬肤灭鼻，乘刚也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "庚寅",
      "liuqin": "官鬼",
      "dir": "东北"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "噬腊肉，遇毒；小吝，无咎。",
      "xiang": "遇毒，位不当也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚辰",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "噬干胏，得金矢，利艰贞，吉。",
      "xiang": "利艰贞吉，未光也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己酉",
      "liuqin": "妻财",
      "dir": "正西"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "噬干肉，得黄金，贞厉，无咎。",
      "xiang": "贞厉无咎，得当也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "己亥",
      "liuqin": "妻财",
      "dir": "西北"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "何校灭耳，凶。",
      "xiang": "何校灭耳，聪不明也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己丑",
      "liuqin": "妻财",
      "dir": "东北"
     }
    ],
    "yong": ""
   },
   {
    "n": 22,
    "name": "山火贲",
    "sym": "䷕",
    "gua": "贲：亨。小利有攸往。",
    "tuan": "贲，亨；柔来而文刚，故亨。分刚上而文柔，故小利有攸往。天文也；文明以止，人文也。观乎天文，以察时变；观乎人文，以化成天下。",
    "xiang": "山下有火，贲；君子以明庶政，无敢折狱。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "贲其趾，舍车而徒。",
      "xiang": "舍车而徒，义弗乘也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "己卯",
      "liuqin": "兄弟",
      "dir": "正东"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "贲其须。",
      "xiang": "贲其须，与上兴也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己巳",
      "liuqin": "兄弟",
      "dir": "东南"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "贲如濡如，永贞吉。",
      "xiang": "永贞之吉，终莫之陵也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己未",
      "liuqin": "兄弟",
      "dir": "西南"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "贲如皤如，白马翰如，匪寇婚媾。",
      "xiang": "六四，当位疑也。匪寇婚媾，终无尤也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "丙戌",
      "liuqin": "父母",
      "dir": "西北"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "贲于丘园，束帛戋戋，吝，终吉。",
      "xiang": "六五之吉，有喜也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙子",
      "liuqin": "父母",
      "dir": "正北"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "白贲，无咎。",
      "xiang": "白贲无咎，上得志也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙寅",
      "liuqin": "父母",
      "dir": "东北"
     }
    ],
    "yong": ""
   },
   {
    "n": 23,
    "name": "山地剥",
    "sym": "䷖",
    "gua": "剥：不利有攸往。",
    "tuan": "剥，剥也，柔变刚也。不利有攸往，小人长也。顺而止之，观象也。君子尚消息盈虚，天行也。",
    "xiang": "山附地上，剥；上以厚下，安宅。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "剥床以足，蔑贞凶。",
      "xiang": "剥床以足，以灭下也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "乙未",
      "liuqin": "妻财",
      "dir": "西南"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "剥床以辨，蔑贞凶。",
      "xiang": "剥床以辨，未有与也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "乙巳",
      "liuqin": "妻财",
      "dir": "东南"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "剥之，无咎。",
      "xiang": "剥之无咎，失上下也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "乙卯",
      "liuqin": "妻财",
      "dir": "正东"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "剥床以肤，凶。",
      "xiang": "剥床以肤，切近灾也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙戌",
      "liuqin": "官鬼",
      "dir": "西北"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "贯鱼，以宫人宠，无不利。",
      "xiang": "以宫人宠，终无尤也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "丙子",
      "liuqin": "官鬼",
      "dir": "正北"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "硕果不食，君子得舆，小人剥庐。",
      "xiang": "君子得舆，民所载也。小人剥庐，终不可用也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙寅",
      "liuqin": "官鬼",
      "dir": "东北"
     }
    ],
    "yong": ""
   },
   {
    "n": 24,
    "name": "地雷复",
    "sym": "䷗",
    "gua": "复：亨。出入无疾，朋来无咎。反复其道，七日来复，利有攸往。",
    "tuan": "复亨；刚反，动而以顺行，是以出入无疾，朋来无咎。反复其道，七日来复，天行也。利有攸往，刚长也。复其见天地之心乎？",
    "xiang": "雷在地中，复；先王以至日闭关，商旅不行，后不省方。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "不远复，无祗悔，元吉。",
      "xiang": "不远之复，以修身也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "庚子",
      "liuqin": "子孙",
      "dir": "正北"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "休复，吉。",
      "xiang": "休复之吉，以下仁也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚寅",
      "liuqin": "子孙",
      "dir": "东北"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "频复，厉无咎。",
      "xiang": "频复之厉，义无咎也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚辰",
      "liuqin": "子孙",
      "dir": "东南"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "中行独复。",
      "xiang": "中行独复，以从道也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "癸丑",
      "liuqin": "妻财",
      "dir": "东北"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "敦复，无悔。",
      "xiang": "敦复无悔，中以自考也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "癸亥",
      "liuqin": "妻财",
      "dir": "西北"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "迷复，凶，有灾眚。用行师，终有大败，以其国君，凶；至于十年，不克征。",
      "xiang": "迷复之凶，反君道也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "癸酉",
      "liuqin": "妻财",
      "dir": "正西"
     }
    ],
    "yong": ""
   },
   {
    "n": 25,
    "name": "天雷无妄",
    "sym": "䷘",
    "gua": "无妄：元亨，利贞。其匪正有眚，不利有攸往。",
    "tuan": "无妄，刚自外来，而为主于内。动而健，刚中而应，大亨以正，天之命也。其匪正有眚，不利有攸往。无妄之往，何之矣？天命不佑，行矣哉？",
    "xiang": "天下雷行，物与无妄；先王以茂对时，育万物。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "无妄，往吉。",
      "xiang": "无妄之往，得志也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "庚子",
      "liuqin": "官鬼",
      "dir": "正北"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "不耕获，不菑畬，则利有攸往。",
      "xiang": "不耕获，未富也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚寅",
      "liuqin": "官鬼",
      "dir": "东北"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "无妄之灾，或系之牛，行人之得，邑人之灾。",
      "xiang": "行人得牛，邑人灾也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚辰",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "可贞，无咎。",
      "xiang": "可贞无咎，固有之也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "壬午",
      "liuqin": "父母",
      "dir": "正南"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "无妄之疾，勿药有喜。",
      "xiang": "无妄之药，不可试也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "壬申",
      "liuqin": "父母",
      "dir": "西南"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "无妄，行有眚，无攸利。",
      "xiang": "无妄之行，穷之灾也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "壬戌",
      "liuqin": "父母",
      "dir": "西北"
     }
    ],
    "yong": ""
   },
   {
    "n": 26,
    "name": "山天大畜",
    "sym": "䷙",
    "gua": "大畜：利贞，不家食吉，利涉大川。",
    "tuan": "大畜，刚健笃实辉光，日新其德，刚上而尚贤。能止健，大正也。不家食吉，养贤也。利涉大川，应乎天也。",
    "xiang": "天在山中，大畜；君子以多识前言往行，以畜其德。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "有厉利已。",
      "xiang": "有厉利已，不犯灾也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "甲子",
      "liuqin": "官鬼",
      "dir": "正北"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "舆说輹。",
      "xiang": "舆说輹，中无尤也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "甲寅",
      "liuqin": "官鬼",
      "dir": "东北"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "良马逐，利艰贞。曰闲舆卫，利有攸往。",
      "xiang": "利有攸往，上合志也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "甲辰",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "童牛之牿，元吉。",
      "xiang": "六四元吉，有喜也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙戌",
      "liuqin": "父母",
      "dir": "西北"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "豮豕之牙，吉。",
      "xiang": "六五之吉，有庆也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "丙子",
      "liuqin": "父母",
      "dir": "正北"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "何天之衢，亨。",
      "xiang": "何天之衢，道大行也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙寅",
      "liuqin": "父母",
      "dir": "东北"
     }
    ],
    "yong": ""
   },
   {
    "n": 27,
    "name": "山雷颐",
    "sym": "䷚",
    "gua": "颐：贞吉。观颐，自求口实。",
    "tuan": "颐贞吉，养正则吉也。观颐，观其所养也；自求口实，观其自养也。天地养万物，圣人养贤，以及万民；颐之时大矣哉！",
    "xiang": "山下有雷，颐；君子以慎言语，节饮食。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "舍尔灵龟，观我朵颐，凶。",
      "xiang": "观我朵颐，亦不足贵也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "庚子",
      "liuqin": "官鬼",
      "dir": "正北"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "颠颐，拂经，于丘颐，征凶。",
      "xiang": "六二征凶，行失类也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚寅",
      "liuqin": "官鬼",
      "dir": "东北"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "拂颐，贞凶，十年勿用，无攸利。",
      "xiang": "十年勿用，道大悖也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚辰",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "颠颐，吉，虎视眈眈，其欲逐逐，无咎。",
      "xiang": "颠颐之吉，上施光也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "丙戌",
      "liuqin": "子孙",
      "dir": "西北"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "拂经，居贞吉，不可涉大川。",
      "xiang": "居贞之吉，顺以从上也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙子",
      "liuqin": "子孙",
      "dir": "正北"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "由颐，厉吉，利涉大川。",
      "xiang": "由颐厉吉，大有庆也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙寅",
      "liuqin": "子孙",
      "dir": "东北"
     }
    ],
    "yong": ""
   },
   {
    "n": 28,
    "name": "泽风大过",
    "sym": "䷛",
    "gua": "大过：栋桡，利有攸往，亨。",
    "tuan": "大过，大者过也。栋桡，本末弱也。刚过而中，巽而说行，利有攸往，乃亨。大过之时大矣哉！",
    "xiang": "泽灭木，大过；君子以独立不惧，遯世无闷。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "藉用白茅，无咎。",
      "xiang": "藉用白茅，柔在下也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "辛丑",
      "liuqin": "官鬼",
      "dir": "东北"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "枯杨生稊，老夫得其女妻，无不利。",
      "xiang": "老夫女妻，过以相与也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛卯",
      "liuqin": "官鬼",
      "dir": "正东"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "栋桡，凶。",
      "xiang": "栋桡之凶，不可以有辅也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛巳",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "栋隆，吉；有它吝。",
      "xiang": "栋隆之吉，不桡乎下也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "丁亥",
      "liuqin": "子孙",
      "dir": "西北"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "枯杨生华，老妇得士夫，无咎无誉。",
      "xiang": "枯杨生华，何可久也。老妇士夫，亦可丑也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁酉",
      "liuqin": "子孙",
      "dir": "正西"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "过涉灭顶，凶，无咎。",
      "xiang": "过涉之凶，不可咎也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁未",
      "liuqin": "子孙",
      "dir": "西南"
     }
    ],
    "yong": ""
   },
   {
    "n": 29,
    "name": "坎为水",
    "sym": "䷜",
    "gua": "坎：习坎，有孚，维心亨，行有尚。",
    "tuan": "习坎，重险也。水流而不盈，行险而不失其信。维心亨，乃以刚中也。行有尚，往有功也。天险不可升也，地险山川丘陵也，王公设险以守其国，坎之时用大矣哉！",
    "xiang": "水洊至，习坎；君子以常德行，习教事。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "习坎，入于坎窞，凶。",
      "xiang": "习坎入坎，失道凶也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊寅",
      "liuqin": "官鬼",
      "dir": "东北"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "坎有险，求小得。",
      "xiang": "求小得，未出中也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊辰",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "来之坎坎，险且枕，入于坎窞，勿用。",
      "xiang": "来之坎坎，终无功也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "戊午",
      "liuqin": "官鬼",
      "dir": "正南"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "樽酒簋贰，用缶，纳约自牖，终无咎。",
      "xiang": "樽酒簋贰，刚柔际也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊申",
      "liuqin": "官鬼",
      "dir": "西南"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "坎不盈，祗既平，无咎。",
      "xiang": "坎不盈，中未大也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊戌",
      "liuqin": "官鬼",
      "dir": "西北"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "系用徽𬙊，寘于丛棘，三岁不得，凶。",
      "xiang": "上六失道，凶三岁也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "戊子",
      "liuqin": "官鬼",
      "dir": "正北"
     }
    ],
    "yong": ""
   },
   {
    "n": 30,
    "name": "离为火",
    "sym": "䷝",
    "gua": "离：利贞，亨。畜牝牛，吉。",
    "tuan": "离，丽也；日月丽乎天，百谷草木丽乎土，重明以丽乎正，乃化成天下。柔丽乎中正，故亨；是以畜牝牛吉也。",
    "xiang": "明两作离，大人以继明照于四方。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "履错然，敬之无咎。",
      "xiang": "履错之敬，以辟咎也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己卯",
      "liuqin": "子孙",
      "dir": "正东"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "黄离，元吉。",
      "xiang": "黄离元吉，得中道也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己巳",
      "liuqin": "子孙",
      "dir": "东南"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "日昃之离，不鼓缶而歌，则大耋之嗟，凶。",
      "xiang": "日昃之离，何可久也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "己未",
      "liuqin": "子孙",
      "dir": "西南"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "突如其来如，焚如，死如，弃如。",
      "xiang": "突如其来如，无所容也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己酉",
      "liuqin": "子孙",
      "dir": "正西"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "出涕沱若，戚嗟若，吉。",
      "xiang": "六五之吉，离王公也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己亥",
      "liuqin": "子孙",
      "dir": "西北"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "王用出征，有嘉折首，获匪其丑，无咎。",
      "xiang": "王用出征，以正邦也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "己丑",
      "liuqin": "子孙",
      "dir": "东北"
     }
    ],
    "yong": ""
   },
   {
    "n": 31,
    "name": "泽山咸",
    "sym": "䷞",
    "gua": "咸，亨，利贞，取女吉。",
    "tuan": "咸，感也。柔上而刚下，二气感应以相与，止而说，男下女，是以亨利贞，取女吉也。天地感而万物化生，圣人感人心而天下和平，观其所感，而天地万物之情可见矣。",
    "xiang": "山上有泽，咸，君子以虚受人。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "咸其拇。",
      "xiang": "咸其拇，志在外也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙辰",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "咸其腓，凶，居吉。",
      "xiang": "虽凶居吉，顺不害也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙午",
      "liuqin": "官鬼",
      "dir": "正南"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "咸其股，执其随，往吝。",
      "xiang": "咸其股，亦不处也。志在随人，所执下也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "丙申",
      "liuqin": "官鬼",
      "dir": "西南"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "贞吉，悔亡，憧憧往来，朋从尔思。",
      "xiang": "贞吉悔亡，未感害也。憧憧往来，未光大也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁亥",
      "liuqin": "官鬼",
      "dir": "西北"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "咸其脢，无悔。",
      "xiang": "咸其脢，志末也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁酉",
      "liuqin": "官鬼",
      "dir": "正西"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "咸其辅颊舌。",
      "xiang": "咸其辅颊舌，滕口说也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "丁未",
      "liuqin": "官鬼",
      "dir": "西南"
     }
    ],
    "yong": ""
   },
   {
    "n": 32,
    "name": "雷风恒",
    "sym": "䷟",
    "gua": "恒：亨，无咎，利贞，利有攸往。",
    "tuan": "恒，久也。刚上而柔下，雷风相与，巽而动，刚柔皆应，恒。恒亨无咎，利贞；久于其道也，天地之道，恒久而不已也。利有攸往，终则有始也。日月得天，而能久照，四时变化，而能久成，圣人久于其道，而天下化成；观其所恒，而天地万物之情可见矣！",
    "xiang": "雷风，恒；君子以立不易方。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "浚恒，贞凶，无攸利。",
      "xiang": "浚恒之凶，始求深也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛丑",
      "liuqin": "官鬼",
      "dir": "东北"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "悔亡。",
      "xiang": "九二悔亡，能久中也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛卯",
      "liuqin": "官鬼",
      "dir": "正东"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "不恒其德，或承之羞，贞吝。",
      "xiang": "不恒其德，无所容也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "辛巳",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "田无禽。",
      "xiang": "久非其位，安得禽也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚午",
      "liuqin": "官鬼",
      "dir": "正南"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "恒其德，贞，妇人吉，夫子凶。",
      "xiang": "妇人贞吉，从一而终也。夫子制义，从妇凶也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚申",
      "liuqin": "官鬼",
      "dir": "西南"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "振恒，凶。",
      "xiang": "振恒在上，大无功也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "庚戌",
      "liuqin": "官鬼",
      "dir": "西北"
     }
    ],
    "yong": ""
   },
   {
    "n": 33,
    "name": "天山遁",
    "sym": "䷠",
    "gua": "遯：亨，小利贞。",
    "tuan": "遯亨，遯而亨也。刚当位而应，与时行也。小利贞，浸而长也。遯之时义大矣哉！",
    "xiang": "天下有山，遯；君子以远小人，不恶而严。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "遯尾，厉，勿用有攸往。",
      "xiang": "遯尾之厉，不往何灾也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙辰",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "执之用黄牛之革，莫之胜说。",
      "xiang": "执用黄牛，固志也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "丙午",
      "liuqin": "官鬼",
      "dir": "正南"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "系遯，有疾厉，畜臣妾吉。",
      "xiang": "系遯之厉，有疾惫也。畜臣妾吉，不可大事也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙申",
      "liuqin": "官鬼",
      "dir": "西南"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "好遯，君子吉，小人否。",
      "xiang": "君子好遯，小人否也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "壬午",
      "liuqin": "子孙",
      "dir": "正南"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "嘉遯，贞吉。",
      "xiang": "嘉遯贞吉，以正志也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "壬申",
      "liuqin": "子孙",
      "dir": "西南"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "肥遯，无不利。",
      "xiang": "肥遯，无不利；无所疑也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "壬戌",
      "liuqin": "子孙",
      "dir": "西北"
     }
    ],
    "yong": ""
   },
   {
    "n": 34,
    "name": "雷天大壮",
    "sym": "䷡",
    "gua": "大壮：利贞。",
    "tuan": "大壮，大者壮也。刚以动，故壮。大壮利贞；大者正也。正大而天地之情可见矣！",
    "xiang": "雷在天上，大壮；君子以非礼勿履。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "壮于趾，征凶，有孚。",
      "xiang": "壮于趾，其孚穷也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "甲子",
      "liuqin": "官鬼",
      "dir": "正北"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "贞吉。",
      "xiang": "九二贞吉，以中也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "甲寅",
      "liuqin": "官鬼",
      "dir": "东北"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "小人用壮，君子用罔，贞厉。羝羊触藩，羸其角。",
      "xiang": "小人用壮，君子罔也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "甲辰",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "贞吉悔亡，藩决不羸，壮于大舆之輹。",
      "xiang": "藩决不羸，尚往也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "庚午",
      "liuqin": "子孙",
      "dir": "正南"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "丧羊于易，无悔。",
      "xiang": "丧羊于易，位不当也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚申",
      "liuqin": "子孙",
      "dir": "西南"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "羝羊触藩，不能退，不能遂，无攸利，艰则吉。",
      "xiang": "不能退，不能遂，不祥也。艰则吉，咎不长也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚戌",
      "liuqin": "子孙",
      "dir": "西北"
     }
    ],
    "yong": ""
   },
   {
    "n": 35,
    "name": "火地晋",
    "sym": "䷢",
    "gua": "晋：康侯用锡马蕃庶，昼日三接。",
    "tuan": "晋，进也。明出地上，顺而丽乎大明，柔进而上行。是以康侯用锡马蕃庶，昼日三接也。",
    "xiang": "明出地上，晋；君子以自昭明德。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "晋如，摧如，贞吉。罔孚，裕无咎。",
      "xiang": "晋如，摧如；独行正也。裕无咎；未受命也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "乙未",
      "liuqin": "妻财",
      "dir": "西南"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "晋如，愁如，贞吉。受兹介福，于其王母。",
      "xiang": "受玆介福，以中正也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "乙巳",
      "liuqin": "妻财",
      "dir": "东南"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "众允，悔亡。",
      "xiang": "众允之，志上行也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "乙卯",
      "liuqin": "妻财",
      "dir": "正东"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "晋如硕鼠，贞厉。",
      "xiang": "硕鼠贞厉，位不当也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "己酉",
      "liuqin": "父母",
      "dir": "正西"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "悔亡，失得勿恤，往吉，无不利。",
      "xiang": "失得勿恤，往有庆也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己亥",
      "liuqin": "父母",
      "dir": "西北"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "晋其角，维用伐邑，厉吉无咎，贞吝。",
      "xiang": "维用伐邑，道未光也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己丑",
      "liuqin": "父母",
      "dir": "东北"
     }
    ],
    "yong": ""
   },
   {
    "n": 36,
    "name": "地火明夷",
    "sym": "䷣",
    "gua": "明夷：利艰贞。",
    "tuan": "明入地中，明夷。内文明而外柔顺，以蒙大难，文王以之。利艰贞，晦其明也，内难而能正其志，箕子以之。",
    "xiang": "明入地中，明夷；君子以莅众，用晦而明。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "明夷于飞，垂其翼。君子于行，三日不食，有攸往，主人有言。",
      "xiang": "君子于行，义不食也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "己卯",
      "liuqin": "官鬼",
      "dir": "正东"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "明夷，夷于左股，用拯马壮，吉。",
      "xiang": "六二之吉，顺以则也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己巳",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "明夷于南狩，得其大首，不可疾贞。",
      "xiang": "南狩之志，乃大得也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己未",
      "liuqin": "官鬼",
      "dir": "西南"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "入于左腹，获明夷之心，出于门庭。",
      "xiang": "入于左腹，获心意也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "癸丑",
      "liuqin": "兄弟",
      "dir": "东北"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "箕子之明夷，利贞。",
      "xiang": "箕子之贞，明不可息也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "癸亥",
      "liuqin": "兄弟",
      "dir": "西北"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "不明晦，初登于天，后入于地。",
      "xiang": "初登于天，照四国也。后入于地，失则也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "癸酉",
      "liuqin": "兄弟",
      "dir": "正西"
     }
    ],
    "yong": ""
   },
   {
    "n": 37,
    "name": "风火家人",
    "sym": "䷤",
    "gua": "家人：利女贞。",
    "tuan": "家人，女正位乎内，男正位乎外，男女正，天地之大义也。家人有严君焉，父母之谓也。父父，子子，兄兄，弟弟，夫夫，妇妇，而家道正；正家而天下定矣。",
    "xiang": "风自火出，家人；君子以言有物，而行有恒。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "闲有家，悔亡。",
      "xiang": "闲有家，志未变也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己卯",
      "liuqin": "妻财",
      "dir": "正东"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "无攸遂，在中馈，贞吉。",
      "xiang": "六二之吉，顺以巽也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "己巳",
      "liuqin": "妻财",
      "dir": "东南"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "家人嗃嗃，悔厉吉；妇子嘻嘻，终吝。",
      "xiang": "家人嗃嗃，未失也；妇子嘻嘻，失家节也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己未",
      "liuqin": "妻财",
      "dir": "西南"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "富家，大吉。",
      "xiang": "富家大吉，顺在位也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛未",
      "liuqin": "官鬼",
      "dir": "西南"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "王假有家，勿恤，往吉。",
      "xiang": "王假有家，交相爱也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "辛酉",
      "liuqin": "官鬼",
      "dir": "正西"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "有孚威如，终吉。",
      "xiang": "威如之吉，反身之谓也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛亥",
      "liuqin": "官鬼",
      "dir": "西北"
     }
    ],
    "yong": ""
   },
   {
    "n": 38,
    "name": "火泽睽",
    "sym": "䷥",
    "gua": "睽：小事吉。",
    "tuan": "睽，火动而上，泽动而下；二女同居，其志不同行；说而丽乎明，柔进而上行，得中而应乎刚；是以小事吉。天地睽，而其事同也；男女睽，而其志通也；万物睽，而其事类也；睽之时用大矣哉！",
    "xiang": "上火下泽，睽；君子以同而异。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "悔亡，丧马勿逐，自复；见恶人无咎。",
      "xiang": "见恶人，以辟咎也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "丁巳",
      "liuqin": "父母",
      "dir": "东南"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "遇主于巷，无咎。",
      "xiang": "遇主于巷，未失道也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁卯",
      "liuqin": "父母",
      "dir": "正东"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "见舆曳，其牛掣，其人天且劓，无初有终。",
      "xiang": "见舆曳，位不当也。无初有终，遇刚也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁丑",
      "liuqin": "父母",
      "dir": "东北"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "睽孤，遇元夫，交孚，厉无咎。",
      "xiang": "交孚无咎，志行也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "己酉",
      "liuqin": "兄弟",
      "dir": "正西"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "悔亡，厥宗噬肤，往何咎。",
      "xiang": "厥宗噬肤，往有庆也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己亥",
      "liuqin": "兄弟",
      "dir": "西北"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "睽孤，见豕负涂，载鬼一车，先张之弧，后说之弧，匪寇婚媾，往遇雨则吉。",
      "xiang": "遇雨之吉，群疑亡也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己丑",
      "liuqin": "兄弟",
      "dir": "东北"
     }
    ],
    "yong": ""
   },
   {
    "n": 39,
    "name": "水山蹇",
    "sym": "䷦",
    "gua": "蹇：利西南，不利东北；利见大人，贞吉。",
    "tuan": "蹇，难也，险在前也。见险而能止，知矣哉！蹇利西南，往得中也；不利东北，其道穷也。利见大人，往有功也。当位贞吉，以正邦也。蹇之时用大矣哉！",
    "xiang": "山上有水，蹇；君子以反身修德。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "往蹇，来誉。",
      "xiang": "往蹇来誉，宜待也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "丙辰",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "王臣蹇蹇，匪躬之故。",
      "xiang": "王臣蹇蹇，终无尤也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙午",
      "liuqin": "官鬼",
      "dir": "正南"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "往蹇来反。",
      "xiang": "往蹇来反，内喜之也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙申",
      "liuqin": "官鬼",
      "dir": "西南"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "往蹇来连。",
      "xiang": "往蹇来连，当位实也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "戊申",
      "liuqin": "父母",
      "dir": "西南"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "大蹇朋来。",
      "xiang": "大蹇朋来，以中节也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊戌",
      "liuqin": "父母",
      "dir": "西北"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "往蹇来硕，吉；利见大人。",
      "xiang": "往蹇来硕，志在内也。利见大人，以从贵也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊子",
      "liuqin": "父母",
      "dir": "正北"
     }
    ],
    "yong": ""
   },
   {
    "n": 40,
    "name": "雷水解",
    "sym": "䷧",
    "gua": "解：利西南，无所往，其来复吉。有攸往，夙吉。",
    "tuan": "解，险以动，动而免乎险，解。解利西南，往得众也。其来复吉，乃得中也。有攸往夙吉，往有功也。天地解，而雷雨作，雷雨作，而百果草木皆甲坼，解之时大矣哉！",
    "xiang": "雷雨作，解；君子以赦过宥罪。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "无咎。",
      "xiang": "刚柔之际，义无咎也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊寅",
      "liuqin": "妻财",
      "dir": "东北"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "田获三狐，得黄矢，贞吉。",
      "xiang": "九二贞吉，得中道也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "戊辰",
      "liuqin": "妻财",
      "dir": "东南"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "负且乘，致寇至，贞吝。",
      "xiang": "负且乘，亦可丑也，自我致戎，又谁咎也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊午",
      "liuqin": "妻财",
      "dir": "正南"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "解而拇，朋至斯孚。",
      "xiang": "解而拇，未当位也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚午",
      "liuqin": "官鬼",
      "dir": "正南"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "君子维有解，吉；有孚于小人。",
      "xiang": "君子有解，小人退也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "庚申",
      "liuqin": "官鬼",
      "dir": "西南"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "公用射隼于高墉之上，获之，无不利。",
      "xiang": "公用射隼，以解悖也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚戌",
      "liuqin": "官鬼",
      "dir": "西北"
     }
    ],
    "yong": ""
   },
   {
    "n": 41,
    "name": "山泽损",
    "sym": "䷨",
    "gua": "损：有孚，元吉，无咎，可贞，利有攸往。曷之用，二簋可用享。",
    "tuan": "损，损下益上，其道上行。损而有孚，元吉，无咎，可贞，利有攸往。曷之用？二簋可用享；二簋应有时。损刚益柔有时，损益盈虚，与时偕行。",
    "xiang": "山下有泽，损；君子以惩忿窒欲。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "巳事遄往，无咎，酌损之。",
      "xiang": "巳事遄往，尚合志也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁巳",
      "liuqin": "父母",
      "dir": "东南"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "利贞，征凶，弗损，益之。",
      "xiang": "九二利贞，中以为志也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁卯",
      "liuqin": "父母",
      "dir": "正东"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "三人行，则损一人；一人行，则得其友。",
      "xiang": "一人行，三则疑也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "丁丑",
      "liuqin": "父母",
      "dir": "东北"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "损其疾，使遄有喜，无咎。",
      "xiang": "损其疾，亦可喜也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙戌",
      "liuqin": "父母",
      "dir": "西北"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "或益之，十朋之龟弗克违，元吉。",
      "xiang": "六五元吉，自上佑也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙子",
      "liuqin": "父母",
      "dir": "正北"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "弗损益之，无咎，贞吉，有攸往，得臣无家。",
      "xiang": "弗损益之，大得志也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "丙寅",
      "liuqin": "父母",
      "dir": "东北"
     }
    ],
    "yong": ""
   },
   {
    "n": 42,
    "name": "风雷益",
    "sym": "䷩",
    "gua": "益：利有攸往，利涉大川。",
    "tuan": "益，损上益下，民说无疆，自上下下，其道大光。利有攸往，中正有庆。利涉大川，木道乃行。益动而巽，日进无疆。天施地生，其益无方。凡益之道，与时偕行。",
    "xiang": "风雷，益；君子以见善则迁，有过则改。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "利用为大作，元吉，无咎。",
      "xiang": "元吉无咎，下不厚事也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚子",
      "liuqin": "官鬼",
      "dir": "正北"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "或益之，十朋之龟弗克违，永贞吉。王用享于帝，吉。",
      "xiang": "或益之，自外来也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚寅",
      "liuqin": "官鬼",
      "dir": "东北"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "益之用凶事，无咎。有孚中行，告公用圭。",
      "xiang": "益用凶事，固有之也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "庚辰",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "中行，告公从。利用为依迁国。",
      "xiang": "告公从，以益志也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛未",
      "liuqin": "官鬼",
      "dir": "西南"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "有孚惠心，勿问元吉。有孚惠我德。",
      "xiang": "有孚惠心，勿问之矣。惠我德，大得志也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛酉",
      "liuqin": "官鬼",
      "dir": "正西"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "莫益之，或击之，立心勿恒，凶。",
      "xiang": "莫益之，偏辞也。或击之，自外来也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "辛亥",
      "liuqin": "官鬼",
      "dir": "西北"
     }
    ],
    "yong": ""
   },
   {
    "n": 43,
    "name": "泽天夬",
    "sym": "䷪",
    "gua": "夬：扬于王庭，孚号，有厉，告自邑，不利即戎，利有攸往。",
    "tuan": "夬，决也，刚决柔也。健而说，决而和，扬于王庭，柔乘五刚也。孚号有厉，其危乃光也。告自邑，不利即戎，所尚乃穷也。利有攸往，刚长乃终也。",
    "xiang": "泽上于天，夬；君子以施禄及下，居德则忌。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "壮于前趾，往不胜为咎。",
      "xiang": "不胜而往，咎也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "甲子",
      "liuqin": "官鬼",
      "dir": "正北"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "惕号，莫夜有戎，勿恤。",
      "xiang": "莫夜有戎，得中道也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "甲寅",
      "liuqin": "官鬼",
      "dir": "东北"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "壮于頄，有凶。君子夬夬，独行，遇雨，若濡，有愠，无咎。",
      "xiang": "君子夬夬，终无咎也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "甲辰",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "臀无肤，其行次且。牵羊悔亡，闻言不信。",
      "xiang": "其行次且，位不当也。闻言不信，聪不明也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁亥",
      "liuqin": "父母",
      "dir": "西北"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "苋陆夬夬，中行无咎。",
      "xiang": "中行无咎，中未光也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "丁酉",
      "liuqin": "父母",
      "dir": "正西"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "无号，终有凶。",
      "xiang": "无号之凶，终不可长也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁未",
      "liuqin": "父母",
      "dir": "西南"
     }
    ],
    "yong": ""
   },
   {
    "n": 44,
    "name": "天风姤",
    "sym": "䷫",
    "gua": "姤：女壮，勿用取女。",
    "tuan": "姤，遇也，柔遇刚也。勿用取女，不可与长也。天地相遇，品物咸章也。刚遇中正，天下大行也。姤之时义大矣哉！",
    "xiang": "天下有风，姤；后以施命诰四方。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "系于金柅，贞吉，有攸往，见凶，羸豕孚蹢躅。",
      "xiang": "系于金柅，柔道牵也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "辛丑",
      "liuqin": "兄弟",
      "dir": "东北"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "包有鱼，无咎，不利宾。",
      "xiang": "包有鱼，义不及宾也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛卯",
      "liuqin": "兄弟",
      "dir": "正东"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "臀无肤，其行次且，厉，无大咎。",
      "xiang": "其行次且，行未牵也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛巳",
      "liuqin": "兄弟",
      "dir": "东南"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "包无鱼，起凶。",
      "xiang": "无鱼之凶，远民也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "壬午",
      "liuqin": "子孙",
      "dir": "正南"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "以杞包瓜，含章，有陨自天。",
      "xiang": "九五含章，中正也。有陨自天，志不舍命也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "壬申",
      "liuqin": "子孙",
      "dir": "西南"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "姤其角，吝，无咎。",
      "xiang": "姤其角，上穷吝也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "壬戌",
      "liuqin": "子孙",
      "dir": "西北"
     }
    ],
    "yong": ""
   },
   {
    "n": 45,
    "name": "泽地萃",
    "sym": "䷬",
    "gua": "萃：亨。王假有庙，利见大人，亨，利贞。用大牲吉，利有攸往。",
    "tuan": "萃，聚也；顺以说，刚中而应，故聚也。王假有庙，致孝享也。利见大人亨，聚以正也。用大牲吉，利有攸往，顺天命也。观其所聚，而天地万物之情可见矣。",
    "xiang": "泽上于地，萃；君子以除戎器，戒不虞。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "有孚不终，乃乱乃萃，若号一握为笑，勿恤，往无咎。",
      "xiang": "乃乱乃萃，其志乱也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "乙未",
      "liuqin": "妻财",
      "dir": "西南"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "引吉，无咎，孚乃利用禴。",
      "xiang": "引吉无咎，中未变也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "乙巳",
      "liuqin": "妻财",
      "dir": "东南"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "萃如，嗟如，无攸利，往无咎，小吝。",
      "xiang": "往无咎，上巽也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "乙卯",
      "liuqin": "妻财",
      "dir": "正东"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "大吉，无咎。",
      "xiang": "大吉无咎，位不当也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁亥",
      "liuqin": "官鬼",
      "dir": "西北"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "萃有位，无咎。匪孚，元永贞，悔亡。",
      "xiang": "萃有位，志未光也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "丁酉",
      "liuqin": "官鬼",
      "dir": "正西"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "赍咨涕洟，无咎。",
      "xiang": "赍咨涕洟，未安上也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁未",
      "liuqin": "官鬼",
      "dir": "西南"
     }
    ],
    "yong": ""
   },
   {
    "n": 46,
    "name": "地风升",
    "sym": "䷭",
    "gua": "升：元亨，用见大人，勿恤，南征吉。",
    "tuan": "柔以时升，巽而顺，刚中而应，是以大亨。用见大人，勿恤；有庆也。南征吉，志行也。",
    "xiang": "地中生木，升；君子以顺德，积小以高大。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "允升，大吉。",
      "xiang": "允升大吉，上合志也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "辛丑",
      "liuqin": "官鬼",
      "dir": "东北"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "孚乃利用禴，无咎。",
      "xiang": "九二之孚，有喜也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛卯",
      "liuqin": "官鬼",
      "dir": "正东"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "升虚邑。",
      "xiang": "升虚邑，无所疑也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛巳",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "王用亨于岐山，吉无咎。",
      "xiang": "王用亨于岐山，顺事也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "癸丑",
      "liuqin": "父母",
      "dir": "东北"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "贞吉，升阶。",
      "xiang": "贞吉升阶，大得志也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "癸亥",
      "liuqin": "父母",
      "dir": "西北"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "冥升，利于不息之贞。",
      "xiang": "冥升在上，消不富也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "癸酉",
      "liuqin": "父母",
      "dir": "正西"
     }
    ],
    "yong": ""
   },
   {
    "n": 47,
    "name": "泽水困",
    "sym": "䷮",
    "gua": "困：亨，贞，大人吉，无咎，有言不信。",
    "tuan": "困，刚掩也。险以说，困而不失其所，亨；其唯君子乎？贞大人吉，以刚中也。有言不信，尚口乃穷也。",
    "xiang": "泽无水，困；君子以致命遂志。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "臀困于株木，入于幽谷，三岁不觌。",
      "xiang": "入于幽谷，幽不明也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "戊寅",
      "liuqin": "父母",
      "dir": "东北"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "困于酒食，朱绂方来，利用享祀，征凶，无咎。",
      "xiang": "困于酒食，中有庆也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊辰",
      "liuqin": "父母",
      "dir": "东南"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "困于石，据于蒺蔾，入于其宫，不见其妻，凶。",
      "xiang": "据于蒺蔾，乘刚也。入于其宫，不见其妻，不祥也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊午",
      "liuqin": "父母",
      "dir": "正南"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "来徐徐，困于金车，吝，有终。",
      "xiang": "来徐徐，志在下也。虽不当位，有与也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "丁亥",
      "liuqin": "官鬼",
      "dir": "西北"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "劓刖，困于赤绂，乃徐有说，利用祭祀。",
      "xiang": "劓刖，志未得也。乃徐有说，以中直也。利用祭祀，受福也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁酉",
      "liuqin": "官鬼",
      "dir": "正西"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "困于葛藟，于臲卼，曰动悔。有悔，征吉。",
      "xiang": "困于葛藟，未当也。动悔，有悔吉，行也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁未",
      "liuqin": "官鬼",
      "dir": "西南"
     }
    ],
    "yong": ""
   },
   {
    "n": 48,
    "name": "水风井",
    "sym": "䷯",
    "gua": "井：改邑不改井，无丧无得，往来井井。汔至，亦未繘井，羸其瓶，凶。",
    "tuan": "巽乎水而上水，井；井养而不穷也。改邑不改井，乃以刚中也。汔至亦未繘井，未有功也。羸其瓶，是以凶也。",
    "xiang": "木上有水，井；君子以劳民劝相。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "井泥不食，旧井无禽。",
      "xiang": "井泥不食，下也。旧井无禽，时舍也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛丑",
      "liuqin": "官鬼",
      "dir": "东北"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "井谷射鲋，瓮敝漏。",
      "xiang": "井谷射鲋，无与也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "辛卯",
      "liuqin": "官鬼",
      "dir": "正东"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "井渫不食，为我心恻，可用汲，王明，并受其福。",
      "xiang": "井渫不食，行恻也。求王明，受福也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛巳",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "井甃，无咎。",
      "xiang": "井甃无咎，修井也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊申",
      "liuqin": "妻财",
      "dir": "西南"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "井冽，寒泉食。",
      "xiang": "寒泉之食，中正也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "戊戌",
      "liuqin": "妻财",
      "dir": "西北"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "井收勿幕，有孚元吉。",
      "xiang": "元吉在上，大成也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊子",
      "liuqin": "妻财",
      "dir": "正北"
     }
    ],
    "yong": ""
   },
   {
    "n": 49,
    "name": "泽火革",
    "sym": "䷰",
    "gua": "革：巳日乃孚，元亨利贞，悔亡。",
    "tuan": "革，水火相息，二女同居，其志不相得，曰革。巳日乃孚；革而信也。文明以说，大亨以正，革而当，其悔乃亡。天地革而四时成，汤武革命，顺乎天而应乎人，革之时大矣哉！",
    "xiang": "泽中有火，革；君子以治历明时。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "巩用黄牛之革。",
      "xiang": "巩用黄牛，不可以有为也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "己卯",
      "liuqin": "官鬼",
      "dir": "正东"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "巳日乃革之，征吉，无咎。",
      "xiang": "巳日革之，行有嘉也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己巳",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "征凶，贞厉，革言三就，有孚。",
      "xiang": "革言三就，又何之矣。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己未",
      "liuqin": "官鬼",
      "dir": "西南"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "悔亡，有孚改命，吉。",
      "xiang": "改命之吉，信志也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "丁亥",
      "liuqin": "妻财",
      "dir": "西北"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "大人虎变，未占有孚。",
      "xiang": "大人虎变，其文炳也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁酉",
      "liuqin": "妻财",
      "dir": "正西"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "君子豹变，小人革面，征凶，居贞吉。",
      "xiang": "君子豹变，其文蔚也。小人革面，顺以从君也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁未",
      "liuqin": "妻财",
      "dir": "西南"
     }
    ],
    "yong": ""
   },
   {
    "n": 50,
    "name": "火风鼎",
    "sym": "䷱",
    "gua": "鼎：元吉，亨。",
    "tuan": "鼎，象也。以木巽火，亨饪也。圣人亨以享上帝，而大亨以养圣贤。巽而耳目聪明，柔进而上行，得中而应乎刚，是以元亨。",
    "xiang": "木上有火，鼎；君子以正位凝命。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "鼎颠趾，利出否，得妾以其子，无咎。",
      "xiang": "鼎颠趾，未悖也。利出否，以从贵也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛丑",
      "liuqin": "妻财",
      "dir": "东北"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "鼎有实，我仇有疾，不我能即，吉。",
      "xiang": "鼎有实，慎所之也。我仇有疾，终无尤也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "辛卯",
      "liuqin": "妻财",
      "dir": "正东"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "鼎耳革，其行塞，雉膏不食，方雨亏悔，终吉。",
      "xiang": "鼎耳革，失其义也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛巳",
      "liuqin": "妻财",
      "dir": "东南"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "鼎折足，覆公𫗧，其形渥，凶。",
      "xiang": "覆公𫗧，信如何也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己酉",
      "liuqin": "子孙",
      "dir": "正西"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "鼎黄耳，金铉，利贞。",
      "xiang": "鼎黄耳，中以为实也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "己亥",
      "liuqin": "子孙",
      "dir": "西北"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "鼎玉铉，大吉，无不利。",
      "xiang": "玉铉在上，刚柔节也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己丑",
      "liuqin": "子孙",
      "dir": "东北"
     }
    ],
    "yong": ""
   },
   {
    "n": 51,
    "name": "震为雷",
    "sym": "䷲",
    "gua": "震：亨。震来虩虩，笑言哑哑。震惊百里，不丧匕鬯。",
    "tuan": "震，亨。震来虩虩，恐致福也。笑言哑哑，后有则也。震惊百里，惊远而惧迩也。出可以守宗庙社稷，以为祭主也。",
    "xiang": "洊雷，震；君子以恐惧修省。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "震来虩虩，后笑言哑哑，吉。",
      "xiang": "震来虩虩，恐致福也。笑言哑哑，后有则也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚子",
      "liuqin": "官鬼",
      "dir": "正北"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "震来厉，亿丧贝，跻于九陵，勿逐，七日得。",
      "xiang": "震来厉，乘刚也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚寅",
      "liuqin": "官鬼",
      "dir": "东北"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "震苏苏，震行无眚。",
      "xiang": "震苏苏，位不当也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "庚辰",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "震遂泥。",
      "xiang": "震遂泥，未光也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚午",
      "liuqin": "官鬼",
      "dir": "正南"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "震往来厉，亿无丧，有事。",
      "xiang": "震往来厉，危行也。其事在中，大无丧也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚申",
      "liuqin": "官鬼",
      "dir": "西南"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "震索索，视矍矍，征凶。震不于其躬，于其邻，无咎。婚媾有言。",
      "xiang": "震索索，中未得也。虽凶无咎，畏邻戒也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "庚戌",
      "liuqin": "官鬼",
      "dir": "西北"
     }
    ],
    "yong": ""
   },
   {
    "n": 52,
    "name": "艮为山",
    "sym": "䷳",
    "gua": "艮：艮其背，不获其身，行其庭，不见其人，无咎。",
    "tuan": "艮，止也。时止则止，时行则行，动静不失其时，其道光明。艮其止，止其所也。上下敌应，不相与也。是以不获其身，行其庭不见其人，无咎也。",
    "xiang": "兼山，艮；君子以思不出其位。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "艮其趾，无咎，利永贞。",
      "xiang": "艮其趾，未失正也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙辰",
      "liuqin": "父母",
      "dir": "东南"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "艮其腓，不拯其随，其心不快。",
      "xiang": "不拯其随，未退听也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙午",
      "liuqin": "父母",
      "dir": "正南"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "艮其限，列其夤，厉薰心。",
      "xiang": "艮其限，危薰心也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "丙申",
      "liuqin": "父母",
      "dir": "西南"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "艮其身，无咎。",
      "xiang": "艮其身，止诸躬也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙戌",
      "liuqin": "父母",
      "dir": "西北"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "艮其辅，言有序，悔亡。",
      "xiang": "艮其辅，以中正也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙子",
      "liuqin": "父母",
      "dir": "正北"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "敦艮，吉。",
      "xiang": "敦艮之吉，以厚终也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "丙寅",
      "liuqin": "父母",
      "dir": "东北"
     }
    ],
    "yong": ""
   },
   {
    "n": 53,
    "name": "风山渐",
    "sym": "䷴",
    "gua": "渐：女归吉，利贞。",
    "tuan": "渐之进也，女归吉也。进得位，往有功也。进以正，可以正邦也。其位刚，得中也。止而巽，动不穷也。",
    "xiang": "山上有木，渐；君子以居贤德，善俗。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "鸿渐于干，小子厉，有言，无咎。",
      "xiang": "小子之厉，义无咎也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙辰",
      "liuqin": "父母",
      "dir": "东南"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "鸿渐于磐，饮食衎衎，吉。",
      "xiang": "饮食衎衎，吉，不素饱也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙午",
      "liuqin": "父母",
      "dir": "正南"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "鸿渐于陆，夫征不复，妇孕不育，凶；利御寇。",
      "xiang": "夫征不复，离群丑也。妇孕不育，失其道也。利用御寇，顺相保也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "丙申",
      "liuqin": "父母",
      "dir": "西南"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "鸿渐于木，或得其桷，无咎。",
      "xiang": "或得其桷，顺以巽也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛未",
      "liuqin": "子孙",
      "dir": "西南"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "鸿渐于陵，妇三岁不孕，终莫之胜，吉。",
      "xiang": "终莫之胜，吉；得所愿也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛酉",
      "liuqin": "子孙",
      "dir": "正西"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "鸿渐于陆，其羽可用为仪，吉。",
      "xiang": "其羽可用为仪，吉；不可乱也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "辛亥",
      "liuqin": "子孙",
      "dir": "西北"
     }
    ],
    "yong": ""
   },
   {
    "n": 54,
    "name": "雷泽归妹",
    "sym": "䷵",
    "gua": "归妹：征凶，无攸利。",
    "tuan": "归妹，天地之大义也。天地不交，而万物不兴，归妹人之终始也。说以动，所归妹也。征凶，位不当也。无攸利，柔乘刚也。",
    "xiang": "泽上有雷，归妹；君子以永终知敝。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "归妹以娣，跛能履，征吉。",
      "xiang": "归妹以娣，以恒也。跛能履吉，相承也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁巳",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "眇能视，利幽人之贞。",
      "xiang": "利幽人之贞，未变常也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁卯",
      "liuqin": "官鬼",
      "dir": "正东"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "归妹以须，反归以娣。",
      "xiang": "归妹以须，未当也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "丁丑",
      "liuqin": "官鬼",
      "dir": "东北"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "归妹愆期，迟归有时。",
      "xiang": "愆期之志，有待而行也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚午",
      "liuqin": "兄弟",
      "dir": "正南"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "帝乙归妹，其君之袂，不如其娣之袂良，月几望，吉。",
      "xiang": "帝乙归妹，不如其娣之袂良也。其位在中，以贵行也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚申",
      "liuqin": "兄弟",
      "dir": "西南"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "女承筐无实，士刲羊无血，无攸利。",
      "xiang": "上六无实，承虚筐也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "庚戌",
      "liuqin": "兄弟",
      "dir": "西北"
     }
    ],
    "yong": ""
   },
   {
    "n": 55,
    "name": "雷火丰",
    "sym": "䷶",
    "gua": "丰：亨，王假之，勿忧，宜日中。",
    "tuan": "丰，大也。明以动，故丰。王假之，尚大也。勿忧宜日中，宜照天下也。日中则昃，月盈则食，天地盈虚，与时消息，而况人于人乎？况于鬼神乎？",
    "xiang": "雷电皆至，丰；君子以折狱致刑。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "遇其配主，虽旬无咎，往有尚。",
      "xiang": "虽旬无咎，过旬灾也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己卯",
      "liuqin": "官鬼",
      "dir": "正东"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "丰其蔀，日中见斗，往得疑疾，有孚发若，吉。",
      "xiang": "有孚发若，信以发志也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "己巳",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "丰其沛，日中见沬，折其右肱，无咎。",
      "xiang": "丰其沛，不可大事也。折其右肱，终不可用也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己未",
      "liuqin": "官鬼",
      "dir": "西南"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "丰其蔀，日中见斗，遇其夷主，吉。",
      "xiang": "丰其蔀，位不当也。日中见斗，幽不明也。遇其夷主，吉；行也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚午",
      "liuqin": "父母",
      "dir": "正南"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "来章，有庆誉，吉。",
      "xiang": "六五之吉，有庆也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "庚申",
      "liuqin": "父母",
      "dir": "西南"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "丰其屋，蔀其家，闚其户，阒其无人，三岁不觌，凶。",
      "xiang": "丰其屋，天际翔也。闚其户，阒其无人，自藏也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚戌",
      "liuqin": "父母",
      "dir": "西北"
     }
    ],
    "yong": ""
   },
   {
    "n": 56,
    "name": "火山旅",
    "sym": "䷷",
    "gua": "旅：小亨，旅贞吉。",
    "tuan": "旅，小亨，柔得中乎外，而顺乎刚，止而丽乎明，是以小亨，旅贞吉也。旅之时义大矣哉！",
    "xiang": "山上有火，旅；君子以明慎用刑，而不留狱。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "旅琐琐，斯其所取灾。",
      "xiang": "旅琐琐，志穷灾也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "丙辰",
      "liuqin": "兄弟",
      "dir": "东南"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "旅即次，怀其资，得童仆贞。",
      "xiang": "得童仆贞，终无尤也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙午",
      "liuqin": "兄弟",
      "dir": "正南"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "旅焚其次，丧其童仆，贞厉。",
      "xiang": "旅焚其次，亦以伤矣。以旅与下，其义丧也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙申",
      "liuqin": "兄弟",
      "dir": "西南"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "旅于处，得其资斧，我心不快。",
      "xiang": "旅于处，未得位也。得其资斧，心未快也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "己酉",
      "liuqin": "子孙",
      "dir": "正西"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "射雉一矢亡，终以誉命。",
      "xiang": "终以誉命，上逮也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己亥",
      "liuqin": "子孙",
      "dir": "西北"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "鸟焚其巢，旅人先笑后号咷。丧牛于易，凶。",
      "xiang": "以旅在上，其义焚也。丧牛于易，终莫之闻也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己丑",
      "liuqin": "子孙",
      "dir": "东北"
     }
    ],
    "yong": ""
   },
   {
    "n": 57,
    "name": "巽为风",
    "sym": "䷸",
    "gua": "巽：小亨，利攸往，利见大人。",
    "tuan": "重巽以申命，刚巽乎中正而志行。柔皆顺乎刚，是以小亨，利有攸往，利见大人。",
    "xiang": "随风，巽；君子以申命行事。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "进退，利武人之贞。",
      "xiang": "进退，志疑也。利武人之贞，志治也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛丑",
      "liuqin": "官鬼",
      "dir": "东北"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "巽在床下，用史巫纷若，吉，无咎。",
      "xiang": "纷若之吉，得中也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛卯",
      "liuqin": "官鬼",
      "dir": "正东"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "频巽，吝。",
      "xiang": "频巽之吝，志穷也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "辛巳",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "悔亡，田获三品。",
      "xiang": "田获三品，有功也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛未",
      "liuqin": "官鬼",
      "dir": "西南"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "贞吉悔亡，无不利。无初有终，先庚三日，后庚三日，吉。",
      "xiang": "九五之吉，位正中也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛酉",
      "liuqin": "官鬼",
      "dir": "正西"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "巽在床下，丧其资斧，贞凶。",
      "xiang": "巽在床下，上穷也。丧其资斧，正乎凶也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "辛亥",
      "liuqin": "官鬼",
      "dir": "西北"
     }
    ],
    "yong": ""
   },
   {
    "n": 58,
    "name": "兑为泽",
    "sym": "䷹",
    "gua": "兑：亨，利贞。",
    "tuan": "兑，说也。刚中而柔外，说以利贞，是以顺乎天，而应乎人。说以先民，民忘其劳；说以犯难，民忘其死；说之大，民劝矣哉！",
    "xiang": "丽泽，兑；君子以朋友讲习。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "和兑，吉。",
      "xiang": "和兑之吉，行未疑也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁巳",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "孚兑，吉，悔亡。",
      "xiang": "孚兑之吉，信志也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁卯",
      "liuqin": "官鬼",
      "dir": "正东"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "来兑，凶。",
      "xiang": "来兑之凶，位不当也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "丁丑",
      "liuqin": "官鬼",
      "dir": "东北"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "商兑，未宁，介疾有喜。",
      "xiang": "九四之喜，有庆也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁亥",
      "liuqin": "官鬼",
      "dir": "西北"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "孚于剥，有厉。",
      "xiang": "孚于剥，位正当也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁酉",
      "liuqin": "官鬼",
      "dir": "正西"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "引兑。",
      "xiang": "上六引兑，未光也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "丁未",
      "liuqin": "官鬼",
      "dir": "西南"
     }
    ],
    "yong": ""
   },
   {
    "n": 59,
    "name": "风水涣",
    "sym": "䷺",
    "gua": "涣：亨。王假有庙，利涉大川，利贞。",
    "tuan": "涣，亨。刚来而不穷，柔得位乎外而上同。王假有庙，王乃在中也。利涉大川，乘木有功也。",
    "xiang": "风行水上，涣；先王以享于帝立庙。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "用拯马壮，吉。",
      "xiang": "初六之吉，顺也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊寅",
      "liuqin": "子孙",
      "dir": "东北"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "涣奔其机，悔亡。",
      "xiang": "涣奔其机，得愿也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "戊辰",
      "liuqin": "子孙",
      "dir": "东南"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "涣其躬，无悔。",
      "xiang": "涣其躬，志在外也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊午",
      "liuqin": "子孙",
      "dir": "正南"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "涣其群，元吉。涣有丘，匪夷所思。",
      "xiang": "涣其群，元吉；光大也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛未",
      "liuqin": "妻财",
      "dir": "西南"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "涣汗其大号，涣王居，无咎。",
      "xiang": "王居无咎，正位也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "辛酉",
      "liuqin": "妻财",
      "dir": "正西"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "涣其血，去逖出，无咎。",
      "xiang": "涣其血，远害也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛亥",
      "liuqin": "妻财",
      "dir": "西北"
     }
    ],
    "yong": ""
   },
   {
    "n": 60,
    "name": "水泽节",
    "sym": "䷻",
    "gua": "节：亨。苦节，不可贞。",
    "tuan": "节，亨，刚柔分，而刚得中。苦节不可贞，其道穷也。说以行险，当位以节，中正以通。天地节而四时成，节以制度，不伤财，不害民。",
    "xiang": "泽上有水，节；君子以制数度，议德行。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "不出户庭，无咎。",
      "xiang": "不出户庭，知通塞也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "丁巳",
      "liuqin": "妻财",
      "dir": "东南"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "不出门庭，凶。",
      "xiang": "不出门庭，失时极也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁卯",
      "liuqin": "妻财",
      "dir": "正东"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "不节若，则嗟若，无咎。",
      "xiang": "不节之嗟，又谁咎也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁丑",
      "liuqin": "妻财",
      "dir": "东北"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "安节，亨。",
      "xiang": "安节之亨，承上道也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "戊申",
      "liuqin": "官鬼",
      "dir": "西南"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "甘节，吉；往有尚。",
      "xiang": "甘节之吉，居位中也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊戌",
      "liuqin": "官鬼",
      "dir": "西北"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "苦节，贞凶，悔亡。",
      "xiang": "苦节贞凶，其道穷也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊子",
      "liuqin": "官鬼",
      "dir": "正北"
     }
    ],
    "yong": ""
   },
   {
    "n": 61,
    "name": "风泽中孚",
    "sym": "䷼",
    "gua": "中孚：豚鱼吉，利涉大川，利贞。",
    "tuan": "中孚，柔在内而刚得中。说而巽，孚，乃化邦也。豚鱼吉，信及豚鱼也。利涉大川，乘木舟虚也。中孚以利贞，乃应乎天也。",
    "xiang": "泽上有风，中孚；君子以议狱缓死。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "虞吉，有它不燕。",
      "xiang": "初九虞吉，志未变也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "丁巳",
      "liuqin": "父母",
      "dir": "东南"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "鸣鹤在阴，其子和之，我有好爵，吾与尔靡之。",
      "xiang": "其子和之，中心愿也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁卯",
      "liuqin": "父母",
      "dir": "正东"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "得敌，或鼓或罢，或泣或歌。",
      "xiang": "可鼓或罢，位不当也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丁丑",
      "liuqin": "父母",
      "dir": "东北"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "月几望，马匹亡，无咎。",
      "xiang": "马匹亡，绝类上也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "辛未",
      "liuqin": "子孙",
      "dir": "西南"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "有孚挛如，无咎。",
      "xiang": "有孚挛如，位正当也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛酉",
      "liuqin": "子孙",
      "dir": "正西"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "翰音登于天，贞凶。",
      "xiang": "翰音登于天，何可长也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "辛亥",
      "liuqin": "子孙",
      "dir": "西北"
     }
    ],
    "yong": ""
   },
   {
    "n": 62,
    "name": "雷山小过",
    "sym": "䷽",
    "gua": "小过：亨，利贞，可小事，不可大事。飞鸟遗之音，不宜上，宜下，大吉。",
    "tuan": "小过，小者过而亨也。过以利贞，与时行也。柔得中，是以小事吉也。刚失位而不中，是以不可大事也。有飞鸟之象焉，有飞鸟遗之音，不宜上宜下，大吉；上逆而下顺也。",
    "xiang": "山上有雷，小过；君子以行过乎恭，丧过乎哀，用过乎俭。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "飞鸟以凶。",
      "xiang": "飞鸟以凶，不可如何也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "丙辰",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "过其祖，遇其妣；不及其君，遇其臣；无咎。",
      "xiang": "不及其君，臣不可过也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙午",
      "liuqin": "官鬼",
      "dir": "正南"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "弗过防之，从或戕之，凶。",
      "xiang": "从或戕之，凶如何也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "丙申",
      "liuqin": "官鬼",
      "dir": "西南"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "无咎，弗过遇之。往厉必戒，勿用永贞。",
      "xiang": "弗过遇之，位不当也。往厉必戒，终不可长也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "庚午",
      "liuqin": "兄弟",
      "dir": "正南"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "密云不雨，自我西郊，公弋取彼在穴。",
      "xiang": "密云不雨，已上也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚申",
      "liuqin": "兄弟",
      "dir": "西南"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "弗遇过之，飞鸟离之，凶，是谓灾眚。",
      "xiang": "弗遇过之，已亢也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "庚戌",
      "liuqin": "兄弟",
      "dir": "西北"
     }
    ],
    "yong": ""
   },
   {
    "n": 63,
    "name": "水火既济",
    "sym": "䷾",
    "gua": "既济：亨，小利贞，初吉终乱。",
    "tuan": "既济，亨，小者亨也。利贞，刚柔正而位当也。初吉，柔得中也。终止则乱，其道穷也。",
    "xiang": "水在火上，既济；君子以思患而预防之。",
    "yao": [
     {
      "pos": 0,
      "head": "初九",
      "text": "曳其轮，濡其尾，无咎。",
      "xiang": "曳其轮，义无咎也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己卯",
      "liuqin": "官鬼",
      "dir": "正东"
     },
     {
      "pos": 1,
      "head": "六二",
      "text": "妇丧其茀，勿逐，七日得。",
      "xiang": "七日得，以中道也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己巳",
      "liuqin": "官鬼",
      "dir": "东南"
     },
     {
      "pos": 2,
      "head": "九三",
      "text": "高宗伐鬼方，三年克之，小人勿用。",
      "xiang": "三年克之，惫也。",
      "yang": 1,
      "isShi": true,
      "isYing": false,
      "ganzhi": "己未",
      "liuqin": "官鬼",
      "dir": "西南"
     },
     {
      "pos": 3,
      "head": "六四",
      "text": "𦈡有衣袽，终日戒。",
      "xiang": "终日戒，有所疑也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊申",
      "liuqin": "官鬼",
      "dir": "西南"
     },
     {
      "pos": 4,
      "head": "九五",
      "text": "东邻杀牛，不如西邻之禴祭，实受其福。",
      "xiang": "东邻杀牛，不如西邻之时也；实受其福，吉大来也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊戌",
      "liuqin": "官鬼",
      "dir": "西北"
     },
     {
      "pos": 5,
      "head": "上六",
      "text": "濡其首，厉。",
      "xiang": "濡其首厉，何可久也。",
      "yang": 0,
      "isShi": false,
      "isYing": true,
      "ganzhi": "戊子",
      "liuqin": "官鬼",
      "dir": "正北"
     }
    ],
    "yong": ""
   },
   {
    "n": 64,
    "name": "火水未济",
    "sym": "䷿",
    "gua": "未济：亨，小狐汔济，濡其尾，无攸利。",
    "tuan": "未济，亨；柔得中也。小狐汔济，未出中也。濡其尾，无攸利；不续终也。虽不当位，刚柔应也。",
    "xiang": "火在水上，未济；君子以慎辨物居方。",
    "yao": [
     {
      "pos": 0,
      "head": "初六",
      "text": "濡其尾，吝。",
      "xiang": "濡其尾，亦不知极也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊寅",
      "liuqin": "子孙",
      "dir": "东北"
     },
     {
      "pos": 1,
      "head": "九二",
      "text": "曳其轮，贞吉。",
      "xiang": "九二贞吉，中以行正也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "戊辰",
      "liuqin": "子孙",
      "dir": "东南"
     },
     {
      "pos": 2,
      "head": "六三",
      "text": "未济，征凶，利涉大川。",
      "xiang": "未济征凶，位不当也。",
      "yang": 0,
      "isShi": true,
      "isYing": false,
      "ganzhi": "戊午",
      "liuqin": "子孙",
      "dir": "正南"
     },
     {
      "pos": 3,
      "head": "九四",
      "text": "贞吉，悔亡，震用伐鬼方，三年有赏于大国。",
      "xiang": "贞吉悔亡，志行也。",
      "yang": 1,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己酉",
      "liuqin": "子孙",
      "dir": "正西"
     },
     {
      "pos": 4,
      "head": "六五",
      "text": "贞吉，无悔，君子之光，有孚，吉。",
      "xiang": "君子之光，其晖吉也。",
      "yang": 0,
      "isShi": false,
      "isYing": false,
      "ganzhi": "己亥",
      "liuqin": "子孙",
      "dir": "西北"
     },
     {
      "pos": 5,
      "head": "上九",
      "text": "有孚于饮酒，无咎，濡其首，有孚失是。",
      "xiang": "饮酒濡首，亦不知节也。",
      "yang": 1,
      "isShi": false,
      "isYing": true,
      "ganzhi": "己丑",
      "liuqin": "子孙",
      "dir": "东北"
     }
    ],
    "yong": ""
   }
  ];

/* 六十四卦常见占断（当代类推，依卦辞卦性撰写，非吉凶断定） */
const DIVINATION_NOTES = [
   {
    "n": 1,
    "note": "刚健上行。天行健，君子以自强不息：宜主动、不宜迟疑。但乾道亢极则反，凡事留三分余地，锋芒过露处即是转机所在。"
   },
   {
    "n": 2,
    "note": "柔顺承载。地势坤，君子以厚德载物：宜承接、配合、蓄势，不争而自得。若一味争先而失其厚，反受其累。"
   },
   {
    "n": 3,
    "note": "创始艰难。云雷屯，君子以经纶：万事开头难，草木穿石。此时宜立根建制、结同伴，不宜求速成。"
   },
   {
    "n": 4,
    "note": "蒙昧启蒙。山下出泉，蒙，君子以果行育德：宜先学后做、先问后行。求师问道、虚心求教，最为捷径。"
   },
   {
    "n": 5,
    "note": "等待时机。云上于天，需，君子以饮食宴乐：时机未至，蓄而待之。所需者久，所需者明；饮食宴乐，正所以养其志。"
   },
   {
    "n": 6,
    "note": "争讼相持。天与水违行，讼，君子以作事谋始：争则两伤，讼则终凶。宜谋之于始、让之于中、止之于终。"
   },
   {
    "n": 7,
    "note": "聚众有纪律。地中有水，师，君子以容民畜众：众之所归在于号令与公义。出师须有名，行事须有度。"
   },
   {
    "n": 8,
    "note": "相亲辅助。水在地上，比，君子以建万国亲诸侯：亲比相辅，德不孤必有邻。择所亲、亲以德，此卦之要。"
   },
   {
    "n": 9,
    "note": "小有蓄积。风行天上，小畜，君子以懿文德：积而未足，只能小步。宜修辞立德以待时，不可贪大求全。"
   },
   {
    "n": 10,
    "note": "履行有戒。天泽履，君子以辩上下：踩虎尾如履虎尾。处境敏感，宜谨言慎行、辨清上下，稳住则安。"
   },
   {
    "n": 11,
    "note": "通泰安和。天地交，泰，后以财天地民则泰：上下通气则泰。往来不阻、内外相应，此时宜大展。"
   },
   {
    "n": 12,
    "note": "闭塞不通。天地不交，否：闭而不通之时。宜退居守正、蓄势待变，非人力可强为。"
   },
   {
    "n": 13,
    "note": "同志同心。天与火同，同人，君子以类族辨物：与同道同行，与相似者相聚。志同则力合。"
   },
   {
    "n": 14,
    "note": "大有丰盛。火在天上，大有，君子以遏恶扬善：所有盛大，宜守中不盈、遏恶扬善，则大而不失其正。"
   },
   {
    "n": 15,
    "note": "谦退受益。地中有山，谦，君子以裒多益寡：谦以自处，反受人之益。锋芒宜藏，德行宜谦。"
   },
   {
    "n": 16,
    "note": "顺动而豫。雷出地奋，豫，先王以作乐崇德：顺势而动，先和悦而后谋事。悦以先民，民忘其劳。"
   },
   {
    "n": 17,
    "note": "随时而动。泽中有雷，随，君子以向晦入宴息：不择时则废事。顺应时势，随而不失其主见。"
   },
   {
    "n": 18,
    "note": "积弊待治。山下有风，蛊，君子以振民育德：积弊已久，烂然蛊坏。宜整顿刷新、振民育德，坏极将复。"
   },
   {
    "n": 19,
    "note": "临事以身。泽上有地，临，君子以教思无穷：亲临其事，以身作则。上下相临，则事可成。"
   },
   {
    "n": 20,
    "note": "观以知照。风行地上，观，君子以省方观民设教：多看少动。风行地上，遍观万物之理而不出于其位。"
   },
   {
    "n": 21,
    "note": "除梗去害。雷电噬嗑，颐中有物：障碍在前，宜断然清除。噬以去梗，颐以养正，去梗方能养。"
   },
   {
    "n": 22,
    "note": "文饰其外。山下有火，贲，君子以明庶政：饰则有所合。文饰在内为质、在外为文，返璞归真为上。"
   },
   {
    "n": 23,
    "note": "剥落将尽。山下有山，剥：阴盛剥阳，顺势当止。剥落之时，宜收缩保存、待阳复来。"
   },
   {
    "n": 24,
    "note": "一阳来复。雷在地中，复，先王以至日闭关：剥极而复，一阳生于下。转机已现，宜静候其长。"
   },
   {
    "n": 25,
    "note": "不妄为。天雷无妄，君子以育万物：率真自然，不妄不强。守正则无咎，妄动则灾。"
   },
   {
    "n": 26,
    "note": "大畜厚储。山天大畜，君子以多识前言往行：畜之既久，其道大光。厚积而后发，此时最宜积累学养。"
   },
   {
    "n": 27,
    "note": "颐养自守。山下雷颐，君子以慎言语、节饮食：养身兼养正。慎言节饮，物理人事皆在此两端。"
   },
   {
    "n": 28,
    "note": "过重须减。泽灭木，大过，君子以独立不惧：栋梁过重而致覆。负担过重之时，宜减负卸责以保其正。"
   },
   {
    "n": 29,
    "note": "重险相叠。习坎，有孚维心，亨：险难重重，唯有诚信可济。行险而不失其正，是为孚。"
   },
   {
    "n": 30,
    "note": "附丽有道。明两作，离，君子以继明照于四方：光明外丽，必有所附。柔顺附物，乃能继明。"
   },
   {
    "n": 31,
    "note": "以诚感人。山上有泽，咸，君子以虚受人：二气感应，心虚则能纳。感应之几在虚，不在巧。"
   },
   {
    "n": 32,
    "note": "恒久之道。雷风恒，君子以立不易方：有恒者因其自然。持之以恒，久而成事；无恒则一切无成。"
   },
   {
    "n": 33,
    "note": "及时退避。天下有山，遁，君子以远小人：不恶而严。退避不是畏，而是保全所当保。"
   },
   {
    "n": 34,
    "note": "壮大戒恃。雷在天上，大壮，君子以非礼弗履：力量正盛，最易恃强。守礼则壮而不折。"
   },
   {
    "n": 35,
    "note": "进升有序。明出地上，晋，君子以自昭明德：旭日升进，柔顺以承。循序而进，名位可望。"
   },
   {
    "n": 36,
    "note": "晦其明守其正。明入地中，明夷，君子以用晦而明：明受伤而不可显。韬光养晦，内守其正，待时而出。"
   },
   {
    "n": 37,
    "note": "齐家之道。风自火出，家人，君子以言有物而行有恒：先正己，再正人。家正则天下定。"
   },
   {
    "n": 38,
    "note": "乖离求同。上火下泽，睽，君子以同而异：二女同居，其志不同。求同存异，小事可济，大事难成。"
   },
   {
    "n": 39,
    "note": "蹇难反身。山上有水，蹇，君子以反身修德：见险而止，反求诸己。前行受阻时，转身修德是最实的路。"
   },
   {
    "n": 40,
    "note": "解困释结。雷雨作，解，君子以赦过宥罪：难解之结渐松。宜及时化解，勿积成患。"
   },
   {
    "n": 41,
    "note": "减损有得。山下有泽，损，君子以惩忿窒欲：损下益上，其道上行。有所舍方有所得。"
   },
   {
    "n": 42,
    "note": "增益互惠。风雷益，君子以见善则迁：损上益下，民说无疆。助人亦自助，利人亦利己。"
   },
   {
    "n": 43,
    "note": "决而分明。泽上于天，夬，君子以施禄及下：五阳决一阴，当断则断。决之须以正，须以明。"
   },
   {
    "n": 44,
    "note": "不期而遇。天下有风，姤，君子以品物咸章：一阴始生，邂逅相遇。遇之则须辨其微，防患未然。"
   },
   {
    "n": 45,
    "note": "荟萃聚众。泽上于地，萃，君子以除戎器、戒不虞：荟萃之时须防外患。聚人亦须聚心。"
   },
   {
    "n": 46,
    "note": "上升不顿。地中生木，升，君子以顺德，积小以高大：循序渐进，积小成高。顺则无咎。"
   },
   {
    "n": 47,
    "note": "困而不失。泽无水，困，君子以致命遂志：困穷之时，守正勿屈。泽无水而道未穷，困极而通必至。"
   },
   {
    "n": 48,
    "note": "井养不穷。木上有水，井，君子以劳民劝相：井养不穷，德施无疆。井者不增不减，其德长久。"
   },
   {
    "n": 49,
    "note": "革故鼎新。泽中有火，革，君子以治历明时：除旧布新。革须当机，鼎须及时。"
   },
   {
    "n": 50,
    "note": "鼎新定鼎。木上有火，鼎，君子以正位凝命：鼎而取象于烹牲，器之重者。革故之后须鼎新，鼎新之后须正位。"
   },
   {
    "n": 51,
    "note": "震惊而动。洊雷震，君子以恐惧修省：震惊不以凶终。惊则起而省，因惧而改。"
   },
   {
    "n": 52,
    "note": "静止生明。兼山艮，君子以思不出其位：思不出其位，不见其人。适其所止，静能生明。"
   },
   {
    "n": 53,
    "note": "循序渐进。山上有木，渐，君子以居贤德善俗：渐之进也，渐之止也。进以序，止以退。"
   },
   {
    "n": 54,
    "note": "归妹名分。泽上有雷，归妹，君子以永终知敝：名分未正而先动。宜谨守始终，不可轻率。"
   },
   {
    "n": 55,
    "note": "丰大守中。雷电皆至，丰，君子以折狱致刑：盛大之时，最易过盈。守中不逾，日中则昃。"
   },
   {
    "n": 56,
    "note": "行旅在外。山上有火，旅，君子以明慎用刑：旅居在外，柔顺自处。旅之贵在谦和而在明慎。"
   },
   {
    "n": 57,
    "note": "顺入有度。随风，巽，君子以申命行事：柔顺渗入，以谦逊入之。巽以申命，反复其心。"
   },
   {
    "n": 58,
    "note": "和悦有节。丽泽，兑，君子以朋友讲习：和悦相与，言语有节。兑之时 说，节则不逸。"
   },
   {
    "n": 59,
    "note": "涣散当聚。风行水上，涣，先王以享于帝立庙：当散则散。散其私而聚其公，是为涣。"
   },
   {
    "n": 60,
    "note": "节制有度。泽上有水，节，君子以制数度，议德行：节则不伤。得其节则通行无阻，失其节则苦而凶。"
   },
   {
    "n": 61,
    "note": "中心诚信。泽上有风，中孚，君子以议狱缓死：诚信在外，感而遂通。中孚者，中心也。"
   },
   {
    "n": 62,
    "note": "小有过越。山上有雷，小过，君子以行过乎恭：可小事，不可大事。宜谨守卑下，行过乎恭。"
   },
   {
    "n": 63,
    "note": "事成防变。水在火上，既济，君子以思患而豫防之：事已成而无终。思患预防，守成不易。"
   },
   {
    "n": 64,
    "note": "未竟慎始。火在水上，未济，君子以慎辨物居方：事未成而未成。六爻皆不当位，终而未终，慎终如始。"
   }
  ];

/* 京房八宫：本宫五行、纳甲、所辖二十四山向、八卦次序 */
const PALACES = {
   "qian": {
    "wx": "金",
    "najia": {
     "inner": [
      "甲子",
      "甲寅",
      "甲辰"
     ],
     "outer": [
      "壬午",
      "壬申",
      "壬戌"
     ]
    },
    "dir": "西北",
    "shan": [
     "戌",
     "乾",
     "亥"
    ],
    "hexes": [
     {
      "n": 1,
      "name": "乾为天",
      "stage": "ben",
      "stageName": "本宫",
      "shi": "上",
      "ying": "三",
      "upper": "qian",
      "lower": "qian"
     },
     {
      "n": 44,
      "name": "天风姤",
      "stage": "yi",
      "stageName": "一世",
      "shi": "初",
      "ying": "四",
      "upper": "qian",
      "lower": "xun"
     },
     {
      "n": 33,
      "name": "天山遁",
      "stage": "er",
      "stageName": "二世",
      "shi": "二",
      "ying": "五",
      "upper": "qian",
      "lower": "gen"
     },
     {
      "n": 12,
      "name": "天地否",
      "stage": "san",
      "stageName": "三世",
      "shi": "三",
      "ying": "上",
      "upper": "qian",
      "lower": "kun"
     },
     {
      "n": 20,
      "name": "风地观",
      "stage": "si",
      "stageName": "四世",
      "shi": "四",
      "ying": "初",
      "upper": "xun",
      "lower": "kun"
     },
     {
      "n": 23,
      "name": "山地剥",
      "stage": "wu",
      "stageName": "五世",
      "shi": "五",
      "ying": "二",
      "upper": "gen",
      "lower": "kun"
     },
     {
      "n": 35,
      "name": "火地晋",
      "stage": "youhun",
      "stageName": "游魂",
      "shi": "四",
      "ying": "初",
      "upper": "li",
      "lower": "kun"
     },
     {
      "n": 14,
      "name": "火天大有",
      "stage": "guihun",
      "stageName": "归魂",
      "shi": "三",
      "ying": "上",
      "upper": "li",
      "lower": "qian"
     }
    ]
   },
   "zhen": {
    "wx": "木",
    "najia": {
     "inner": [
      "庚子",
      "庚寅",
      "庚辰"
     ],
     "outer": [
      "庚午",
      "庚申",
      "庚戌"
     ]
    },
    "dir": "正东",
    "shan": [
     "甲",
     "卯",
     "乙"
    ],
    "hexes": [
     {
      "n": 51,
      "name": "震为雷",
      "stage": "ben",
      "stageName": "本宫",
      "shi": "上",
      "ying": "三",
      "upper": "zhen",
      "lower": "zhen"
     },
     {
      "n": 16,
      "name": "雷地豫",
      "stage": "yi",
      "stageName": "一世",
      "shi": "初",
      "ying": "四",
      "upper": "zhen",
      "lower": "kun"
     },
     {
      "n": 40,
      "name": "雷水解",
      "stage": "er",
      "stageName": "二世",
      "shi": "二",
      "ying": "五",
      "upper": "zhen",
      "lower": "kan"
     },
     {
      "n": 32,
      "name": "雷风恒",
      "stage": "san",
      "stageName": "三世",
      "shi": "三",
      "ying": "上",
      "upper": "zhen",
      "lower": "xun"
     },
     {
      "n": 46,
      "name": "地风升",
      "stage": "si",
      "stageName": "四世",
      "shi": "四",
      "ying": "初",
      "upper": "kun",
      "lower": "xun"
     },
     {
      "n": 48,
      "name": "水风井",
      "stage": "wu",
      "stageName": "五世",
      "shi": "五",
      "ying": "二",
      "upper": "kan",
      "lower": "xun"
     },
     {
      "n": 28,
      "name": "泽风大过",
      "stage": "youhun",
      "stageName": "游魂",
      "shi": "四",
      "ying": "初",
      "upper": "dui",
      "lower": "xun"
     },
     {
      "n": 17,
      "name": "泽雷随",
      "stage": "guihun",
      "stageName": "归魂",
      "shi": "三",
      "ying": "上",
      "upper": "dui",
      "lower": "zhen"
     }
    ]
   },
   "kan": {
    "wx": "水",
    "najia": {
     "inner": [
      "戊寅",
      "戊辰",
      "戊午"
     ],
     "outer": [
      "戊申",
      "戊戌",
      "戊子"
     ]
    },
    "dir": "正北",
    "shan": [
     "壬",
     "子",
     "癸"
    ],
    "hexes": [
     {
      "n": 29,
      "name": "坎为水",
      "stage": "ben",
      "stageName": "本宫",
      "shi": "上",
      "ying": "三",
      "upper": "kan",
      "lower": "kan"
     },
     {
      "n": 60,
      "name": "水泽节",
      "stage": "yi",
      "stageName": "一世",
      "shi": "初",
      "ying": "四",
      "upper": "kan",
      "lower": "dui"
     },
     {
      "n": 3,
      "name": "水雷屯",
      "stage": "er",
      "stageName": "二世",
      "shi": "二",
      "ying": "五",
      "upper": "kan",
      "lower": "zhen"
     },
     {
      "n": 63,
      "name": "水火既济",
      "stage": "san",
      "stageName": "三世",
      "shi": "三",
      "ying": "上",
      "upper": "kan",
      "lower": "li"
     },
     {
      "n": 49,
      "name": "泽火革",
      "stage": "si",
      "stageName": "四世",
      "shi": "四",
      "ying": "初",
      "upper": "dui",
      "lower": "li"
     },
     {
      "n": 55,
      "name": "雷火丰",
      "stage": "wu",
      "stageName": "五世",
      "shi": "五",
      "ying": "二",
      "upper": "zhen",
      "lower": "li"
     },
     {
      "n": 36,
      "name": "地火明夷",
      "stage": "youhun",
      "stageName": "游魂",
      "shi": "四",
      "ying": "初",
      "upper": "kun",
      "lower": "li"
     },
     {
      "n": 7,
      "name": "地水师",
      "stage": "guihun",
      "stageName": "归魂",
      "shi": "三",
      "ying": "上",
      "upper": "kun",
      "lower": "kan"
     }
    ]
   },
   "gen": {
    "wx": "土",
    "najia": {
     "inner": [
      "丙辰",
      "丙午",
      "丙申"
     ],
     "outer": [
      "丙戌",
      "丙子",
      "丙寅"
     ]
    },
    "dir": "东北",
    "shan": [
     "丑",
     "艮",
     "寅"
    ],
    "hexes": [
     {
      "n": 52,
      "name": "艮为山",
      "stage": "ben",
      "stageName": "本宫",
      "shi": "上",
      "ying": "三",
      "upper": "gen",
      "lower": "gen"
     },
     {
      "n": 22,
      "name": "山火贲",
      "stage": "yi",
      "stageName": "一世",
      "shi": "初",
      "ying": "四",
      "upper": "gen",
      "lower": "li"
     },
     {
      "n": 26,
      "name": "山天大畜",
      "stage": "er",
      "stageName": "二世",
      "shi": "二",
      "ying": "五",
      "upper": "gen",
      "lower": "qian"
     },
     {
      "n": 41,
      "name": "山泽损",
      "stage": "san",
      "stageName": "三世",
      "shi": "三",
      "ying": "上",
      "upper": "gen",
      "lower": "dui"
     },
     {
      "n": 38,
      "name": "火泽睽",
      "stage": "si",
      "stageName": "四世",
      "shi": "四",
      "ying": "初",
      "upper": "li",
      "lower": "dui"
     },
     {
      "n": 10,
      "name": "天泽履",
      "stage": "wu",
      "stageName": "五世",
      "shi": "五",
      "ying": "二",
      "upper": "qian",
      "lower": "dui"
     },
     {
      "n": 61,
      "name": "风泽中孚",
      "stage": "youhun",
      "stageName": "游魂",
      "shi": "四",
      "ying": "初",
      "upper": "xun",
      "lower": "dui"
     },
     {
      "n": 53,
      "name": "风山渐",
      "stage": "guihun",
      "stageName": "归魂",
      "shi": "三",
      "ying": "上",
      "upper": "xun",
      "lower": "gen"
     }
    ]
   },
   "kun": {
    "wx": "土",
    "najia": {
     "inner": [
      "乙未",
      "乙巳",
      "乙卯"
     ],
     "outer": [
      "癸丑",
      "癸亥",
      "癸酉"
     ]
    },
    "dir": "西南",
    "shan": [
     "未",
     "坤",
     "申"
    ],
    "hexes": [
     {
      "n": 2,
      "name": "坤为地",
      "stage": "ben",
      "stageName": "本宫",
      "shi": "上",
      "ying": "三",
      "upper": "kun",
      "lower": "kun"
     },
     {
      "n": 24,
      "name": "地雷复",
      "stage": "yi",
      "stageName": "一世",
      "shi": "初",
      "ying": "四",
      "upper": "kun",
      "lower": "zhen"
     },
     {
      "n": 19,
      "name": "地泽临",
      "stage": "er",
      "stageName": "二世",
      "shi": "二",
      "ying": "五",
      "upper": "kun",
      "lower": "dui"
     },
     {
      "n": 11,
      "name": "地天泰",
      "stage": "san",
      "stageName": "三世",
      "shi": "三",
      "ying": "上",
      "upper": "kun",
      "lower": "qian"
     },
     {
      "n": 34,
      "name": "雷天大壮",
      "stage": "si",
      "stageName": "四世",
      "shi": "四",
      "ying": "初",
      "upper": "zhen",
      "lower": "qian"
     },
     {
      "n": 43,
      "name": "泽天夬",
      "stage": "wu",
      "stageName": "五世",
      "shi": "五",
      "ying": "二",
      "upper": "dui",
      "lower": "qian"
     },
     {
      "n": 5,
      "name": "水天需",
      "stage": "youhun",
      "stageName": "游魂",
      "shi": "四",
      "ying": "初",
      "upper": "kan",
      "lower": "qian"
     },
     {
      "n": 8,
      "name": "水地比",
      "stage": "guihun",
      "stageName": "归魂",
      "shi": "三",
      "ying": "上",
      "upper": "kan",
      "lower": "kun"
     }
    ]
   },
   "xun": {
    "wx": "木",
    "najia": {
     "inner": [
      "辛丑",
      "辛卯",
      "辛巳"
     ],
     "outer": [
      "辛未",
      "辛酉",
      "辛亥"
     ]
    },
    "dir": "东南",
    "shan": [
     "辰",
     "巽",
     "巳"
    ],
    "hexes": [
     {
      "n": 57,
      "name": "巽为风",
      "stage": "ben",
      "stageName": "本宫",
      "shi": "上",
      "ying": "三",
      "upper": "xun",
      "lower": "xun"
     },
     {
      "n": 9,
      "name": "风天小畜",
      "stage": "yi",
      "stageName": "一世",
      "shi": "初",
      "ying": "四",
      "upper": "xun",
      "lower": "qian"
     },
     {
      "n": 37,
      "name": "风火家人",
      "stage": "er",
      "stageName": "二世",
      "shi": "二",
      "ying": "五",
      "upper": "xun",
      "lower": "li"
     },
     {
      "n": 42,
      "name": "风雷益",
      "stage": "san",
      "stageName": "三世",
      "shi": "三",
      "ying": "上",
      "upper": "xun",
      "lower": "zhen"
     },
     {
      "n": 25,
      "name": "天雷无妄",
      "stage": "si",
      "stageName": "四世",
      "shi": "四",
      "ying": "初",
      "upper": "qian",
      "lower": "zhen"
     },
     {
      "n": 21,
      "name": "火雷噬嗑",
      "stage": "wu",
      "stageName": "五世",
      "shi": "五",
      "ying": "二",
      "upper": "li",
      "lower": "zhen"
     },
     {
      "n": 27,
      "name": "山雷颐",
      "stage": "youhun",
      "stageName": "游魂",
      "shi": "四",
      "ying": "初",
      "upper": "gen",
      "lower": "zhen"
     },
     {
      "n": 18,
      "name": "山风蛊",
      "stage": "guihun",
      "stageName": "归魂",
      "shi": "三",
      "ying": "上",
      "upper": "gen",
      "lower": "xun"
     }
    ]
   },
   "li": {
    "wx": "火",
    "najia": {
     "inner": [
      "己卯",
      "己巳",
      "己未"
     ],
     "outer": [
      "己酉",
      "己亥",
      "己丑"
     ]
    },
    "dir": "正南",
    "shan": [
     "丙",
     "午",
     "丁"
    ],
    "hexes": [
     {
      "n": 30,
      "name": "离为火",
      "stage": "ben",
      "stageName": "本宫",
      "shi": "上",
      "ying": "三",
      "upper": "li",
      "lower": "li"
     },
     {
      "n": 56,
      "name": "火山旅",
      "stage": "yi",
      "stageName": "一世",
      "shi": "初",
      "ying": "四",
      "upper": "li",
      "lower": "gen"
     },
     {
      "n": 50,
      "name": "火风鼎",
      "stage": "er",
      "stageName": "二世",
      "shi": "二",
      "ying": "五",
      "upper": "li",
      "lower": "xun"
     },
     {
      "n": 64,
      "name": "火水未济",
      "stage": "san",
      "stageName": "三世",
      "shi": "三",
      "ying": "上",
      "upper": "li",
      "lower": "kan"
     },
     {
      "n": 4,
      "name": "山水蒙",
      "stage": "si",
      "stageName": "四世",
      "shi": "四",
      "ying": "初",
      "upper": "gen",
      "lower": "kan"
     },
     {
      "n": 59,
      "name": "风水涣",
      "stage": "wu",
      "stageName": "五世",
      "shi": "五",
      "ying": "二",
      "upper": "xun",
      "lower": "kan"
     },
     {
      "n": 6,
      "name": "天水讼",
      "stage": "youhun",
      "stageName": "游魂",
      "shi": "四",
      "ying": "初",
      "upper": "qian",
      "lower": "kan"
     },
     {
      "n": 13,
      "name": "天火同人",
      "stage": "guihun",
      "stageName": "归魂",
      "shi": "三",
      "ying": "上",
      "upper": "qian",
      "lower": "li"
     }
    ]
   },
   "dui": {
    "wx": "金",
    "najia": {
     "inner": [
      "丁巳",
      "丁卯",
      "丁丑"
     ],
     "outer": [
      "丁亥",
      "丁酉",
      "丁未"
     ]
    },
    "dir": "正西",
    "shan": [
     "庚",
     "酉",
     "辛"
    ],
    "hexes": [
     {
      "n": 58,
      "name": "兑为泽",
      "stage": "ben",
      "stageName": "本宫",
      "shi": "上",
      "ying": "三",
      "upper": "dui",
      "lower": "dui"
     },
     {
      "n": 47,
      "name": "泽水困",
      "stage": "yi",
      "stageName": "一世",
      "shi": "初",
      "ying": "四",
      "upper": "dui",
      "lower": "kan"
     },
     {
      "n": 45,
      "name": "泽地萃",
      "stage": "er",
      "stageName": "二世",
      "shi": "二",
      "ying": "五",
      "upper": "dui",
      "lower": "kun"
     },
     {
      "n": 31,
      "name": "泽山咸",
      "stage": "san",
      "stageName": "三世",
      "shi": "三",
      "ying": "上",
      "upper": "dui",
      "lower": "gen"
     },
     {
      "n": 39,
      "name": "水山蹇",
      "stage": "si",
      "stageName": "四世",
      "shi": "四",
      "ying": "初",
      "upper": "kan",
      "lower": "gen"
     },
     {
      "n": 15,
      "name": "地山谦",
      "stage": "wu",
      "stageName": "五世",
      "shi": "五",
      "ying": "二",
      "upper": "kun",
      "lower": "gen"
     },
     {
      "n": 62,
      "name": "雷山小过",
      "stage": "youhun",
      "stageName": "游魂",
      "shi": "四",
      "ying": "初",
      "upper": "zhen",
      "lower": "gen"
     },
     {
      "n": 54,
      "name": "雷泽归妹",
      "stage": "guihun",
      "stageName": "归魂",
      "shi": "三",
      "ying": "上",
      "upper": "zhen",
      "lower": "dui"
     }
    ]
   }
  };

const SHI_YAO_NAME = ["初","二","三","四","五","上"];
const YAO_POS_NAME = ['初', '二', '三', '四', '五', '上'];

const TRIGRAM_NAME = { qian: '乾', dui: '兑', li: '离', zhen: '震', xun: '巽', kan: '坎', gen: '艮', kun: '坤' };
const PALACE_WX = { qian: '金', dui: '金', li: '火', zhen: '木', xun: '木', kan: '水', gen: '土', kun: '土' };

/* ===============================================================
 * 查询接口
 * =============================================================== */

/** 取一卦详解（n 为 1..64）；取不到返回 null */
function getText(n) {
  return HEXAGRAM_TEXTS[n - 1] || null;
}

const PALACE_KEYS = Object.keys(PALACES);

/** 卦序（1..64）→ 宫位对象，避免每次线性查找 */
const PALACE_INDEX = {};
PALACE_KEYS.forEach((pal) => {
  PALACE_INDEX[pal] = {};
  PALACES[pal].hexes.forEach((g) => { PALACE_INDEX[pal][g.n] = g; });
});

/** 取一卦的京房八宫信息 */
function getPalace(n) {
  if (!HEXAGRAM_TEXTS[n - 1]) return null;
  for (let i = 0; i < PALACE_KEYS.length; i++) {
    const key = PALACE_KEYS[i];
    const g = PALACE_INDEX[key][n];
    if (!g) continue;
    return {
      palace: key,
      palaceName: TRIGRAM_NAME[key],
      wuxing: PALACES[key].wx,
      stage: g.stage,
      stageName: g.stageName,
      shi: g.shi,
      ying: g.ying,
      najia: PALACES[key].najia,
      dir: PALACES[key].dir,
      shan: PALACES[key].shan,
      hexes: PALACES[key].hexes
    };
  }
  return null;
}

/** 取一卦的常见占断（当代类推） */
function getDivination(n) {
  const d = DIVINATION_NOTES[n - 1];
  return d ? d.note : '';
}

/** 取某一爻（0 = 初爻，5 = 上爻） */
function getYao(n, pos) {
  const t = HEXAGRAM_TEXTS[n - 1];
  if (!t) return null;
  return t.yao[pos] || null;
}

/** 取一卦的阴阳爻分布 */
function getYaoProfile(n) {
  const t = HEXAGRAM_TEXTS[n - 1];
  if (!t) return null;
  const yang = t.yao.filter((y) => y.yang === 1).length;
  return { yang, yin: 6 - yang, lines: t.yao.map((y) => y.yang) };
}

const API = {
  HEXAGRAM_TEXTS,
  DIVINATION_NOTES,
  PALACES,
  SHI_YAO_NAME,
  YAO_POS_NAME,
  TRIGRAM_NAME,
  PALACE_WX,
  getText,
  getPalace,
  getDivination,
  getYao,
  getYaoProfile
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
} else if (typeof window !== 'undefined') {
  window.ICTexts = API;
}

})();
