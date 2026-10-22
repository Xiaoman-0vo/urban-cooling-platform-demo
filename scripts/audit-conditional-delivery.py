"""Read actual browser downloads independently of the app's JavaScript validators."""
import base64
import csv
import hashlib
import io
import json
import zipfile
from datetime import datetime
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
ROOT = APP.parent
EVIDENCE = APP / 'evidence/条件情景交付_20261006'
DOWNLOADS = Path('/Users/wangyanbo/Downloads')
MANIFEST = ROOT / '平台产品设计/条件获取与制度温度来源接入清单_20261006.json'
ORIGINAL_ZIP = ROOT / '共享接口/条件获取与来源交接/237500352dce3223/条件获取与来源原件_20261006.zip'
BASE_JSON = DOWNLOADS / '街区交接_E4125_N33891_2026-10-06T03-14-14-141Z.json'
BASE_ZIP = DOWNLOADS / '街区交接_E4125_N33891_2026-10-06T03-14-28-879Z.zip'
REPORT = APP / '条件获取与两类情景交付_20261006.json'
READABLE = APP / '条件获取与两类情景交付_20261006.md'

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def fingerprint(path):
    raw = path.read_bytes()
    return {'path': str(path), 'bytes': len(raw), 'sha256': sha(raw)}

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()

def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))

def archive(raw):
    result = zipfile.ZipFile(io.BytesIO(raw))
    assert result.testzip() is None
    assert len(result.namelist()) == len(set(result.namelist()))
    return result

qa = read_json(EVIDENCE / '浏览器实际回读.json')
def event(step):
    return [e for e in qa if e['step'] == step][-1]

def downloaded(step):
    e = event(step)
    receipt = e['receipt'].splitlines()
    path = DOWNLOADS / receipt[0].split('：', 1)[1]
    f = fingerprint(path)
    assert f['sha256'] == receipt[1].split('：', 1)[1]
    assert f['bytes'] == int(receipt[2].split()[0].replace(',', ''))
    return path, f

json_path, json_identity = downloaded('actual_json_download')
zip_path, zip_identity = downloaded('actual_zip_download')
project = read_json(json_path)
baseline = read_json(BASE_JSON)
assert sha(BASE_JSON.read_bytes()) == 'b08a6a127a5709598b16f668fc4b0cfe2dee7e43aecd855c1c4338c3b6ed7628'
assert sha(BASE_ZIP.read_bytes()) == '9b2a14d5ce03c27d44418976b183e5aaf24bc33ad546a7cf923f5803cc6a45d2'
assert sha(MANIFEST.read_bytes()) == '237500352dce32232a011dada8cf93049b097510a955f0085194f6e89b001253'
assert sha(ORIGINAL_ZIP.read_bytes()) == '6b9a12ec4b8bfb03491b68fd02202a674ad61d1616daf166c310310fdbcca3d1'
manifest = read_json(MANIFEST)
files = [f for g in manifest['groups'] for f in g['files']]
assert len(files) == 26 and sum(f['bytes'] for f in files) == 469234
assert len(project['conditionalSourceRegistrations']) == 3
assert len(project['conditionalScenarioDrafts']) == 2

outer = archive(zip_path.read_bytes())
source = archive(ORIGINAL_ZIP.read_bytes())
assert set(source.namelist()) == {f['path'] for f in files} | {str(MANIFEST.relative_to(ROOT))}
assert source.read(str(MANIFEST.relative_to(ROOT))) == MANIFEST.read_bytes()
assert outer.read('project.json') == json_path.read_bytes()
assert json.loads(outer.read('conditional-scenarios/drafts.json')) == project['conditionalScenarioDrafts']
assert json.loads(outer.read('conditional-sources/registrations.json')) == project['conditionalSourceRegistrations']
assert outer.read('conditional-sources/source-manifest.json') == MANIFEST.read_bytes()
assert outer.read('conditional-sources/original-source.zip') == ORIGINAL_ZIP.read_bytes()
for registration, group in zip(project['conditionalSourceRegistrations'], manifest['groups']):
    assert registration['source_group'] == group
    assert registration['registration_id'] == 'conditional-source:' + group['group_id'] + ':' + group['source_set_sha256']
    assert sha(canonical(group['files'])) == group['source_set_sha256']
    assert registration['research_adoption'] is False
    assert base64.b64decode(registration['manifest_base64'], validate=True) == MANIFEST.read_bytes()
    assert base64.b64decode(registration['archive_base64'], validate=True) == ORIGINAL_ZIP.read_bytes()

originals = []
for spec in files:
    raw = (ROOT / spec['path']).read_bytes()
    assert len(raw) == spec['bytes'] and sha(raw) == spec['sha256']
    assert raw.startswith(b'\xef\xbb\xbf') is spec['raw_UTF8_BOM']
    assert source.read(spec['path']) == raw
    assert outer.read('conditional-sources/inputs/' + spec['path']) == raw
    for step in ['original_read', 'actual_json_reopened_original', 'actual_zip_reopened_original']:
        observed = [e for e in qa if e['step'] == step and e['path'] == spec['path']][-1]
        assert observed['text'] == raw.decode('utf-8')
        assert observed['label'].startswith('历史 · ') is (spec['role'] == 'retained_superseded_history')
    originals.append({**spec, 'disk_json_zip_browser_equal': True})

park_root = '共享接口/服务链准备/望江楼开放制度公开来源_20261006/'
park = read_json(ROOT / (park_root + '官方分区与开放事件证据.json'))
csv_raw = (ROOT / (park_root + '官方证据索引.csv')).read_bytes()
csv_rows = list(csv.reader(io.StringIO(csv_raw.decode('utf-8-sig'), newline='')))
assert len(csv_rows[1:]) == 7 and sum(map(len, csv_rows[1:])) == 119
assert sum(c == '' for row in csv_rows[1:] for c in row) == 39
preview = read_json(ROOT / '共享接口/温度来源准备/NCDC公开目录核查_20261006/公开年度目录行.json')
ncdc = read_json(ROOT / '共享接口/温度来源准备/NCDC公开目录核查_20261006/公开目录取得记录.json')
for step in ['actual_json_reopened_tables', 'actual_zip_reopened_tables']:
    assert event(step)['park_cells'] == csv_rows[1:]
    assert event(step)['ncdc_cells'] == [row['cells'] for row in preview['rows']]
assert len(park['claims']) == 7 and len(park['sources']) == 8
assert len(preview['rows']) == 11 and ncdc['raster_acquired'] is False
assert len([f for f in files if f['role'] == 'retained_superseded_history']) == 7
assert len(event('source_full_facts_tables_candidate')['content']['facts']) == 7
assert len(event('eight_webpage_identities')['identities']) == 8
assert '评价早于该事件；不可套用' in event('event_status_WJ05')['text']
assert '结束时点未知；不能认作无限期有效' in event('event_status_WJ03')['text']
assert '生效时点未知；公告日期不等于生效日期' in event('event_status_WJ07')['text']
assert all(e['exact'] for e in event('save_reload_restore_exact_comparison')['comparisons'])
for mode, label in [('uniform', '统一开放假设'), ('real', '现实条件核对')]:
    identity = event(mode + '_saved_identity')['identity']
    for step in ['actual_json_reopened_draft', 'actual_zip_reopened_draft']:
        assert [e for e in qa if e['step'] == step and e['mode'] == label][-1]['identity'] == identity
    assert [e for e in qa if e['step'] == 'after_negative_local_saved_restored_draft' and e['mode'] == label][-1]['identity'] == identity
for draft in project['conditionalScenarioDrafts']:
    assert all(v is None for v in draft['adopted'].values())
    assert all(v is None for v in draft['scientific_outputs'].values())
    assert draft['width_assumption_m'] is None
    assert all(r['purpose'] and r['object_key'] is None for r in draft['source_references'])
assert project['conditionalScenarioDrafts'][0]['draft_id'] != project['conditionalScenarioDrafts'][1]['draft_id']
assert len(set(d['mode_id'] for d in project['conditionalScenarioDrafts'])) == 2
legacy_keys = ['sourcePackage', 'scene', 'layers', 'imports', 'researchRegistrations', 'preparationRegistrations', 'supplementRegistrations', 'sourcePreparationRegistrations', 'geometrySourceRegistrations', 'software_receipt']
for key in legacy_keys:
    assert project[key] == baseline[key]
rejected = [e for e in qa if e['step'] == 'rejected_import']
assert {e['name'] for e in rejected} == {'错误对象短键', '错误门绑定', '目录升级栅格', '情景来源空值'}
assert all(e['message'].startswith('无法重开：') and e['identity_unchanged'] for e in rejected)
old_zip = archive(BASE_ZIP.read_bytes())
old_payload_unchanged = [n for n in old_zip.namelist() if not n.endswith('/') and n not in ['project.json', '交接说明.md', 'archive-receipt.json']]
for name in old_payload_unchanged:
    assert outer.read(name) == old_zip.read(name)
receipt = json.loads(outer.read('archive-receipt.json'))
payload = [n for n in outer.namelist() if not n.endswith('/') and n != 'archive-receipt.json']
assert set(payload) == {m['path'] for m in receipt['members']}
for member in receipt['members']:
    raw = outer.read(member['path'])
    assert len(raw) == member['bytes'] and sha(raw) == member['sha256']

implementation_paths = ['src/App.jsx', 'src/project.js', 'src/ConditionalScenarios.jsx', 'src/conditional-drafts.js', 'src/conditional-source-state.js', 'src/conditional-source-catalog.js', 'src/styles.css', 'src/MapCanvas.jsx', 'public/data/conditional-source-state.json', 'scripts/prepare-conditional-sources.py', 'scripts/audit-conditional-delivery.py', 'tests/conditional-scenarios.test.mjs', 'package.json', 'AGENTS.md']
code = [fingerprint(APP / p) for p in implementation_paths]
assert next(f for f in code if f['path'].endswith('/src/MapCanvas.jsx'))['sha256'] == 'd3cd62ee46002c0f25cffbeaff0b731737f97b36801fbe49b8a24278c13b8eff'
build = [fingerprint(p) for p in (APP / 'dist').rglob('*') if p.is_file() and '/data/' not in str(p)]
assert (APP / 'dist/client/index.html').is_file() and (APP / 'dist/server/index.js').is_file() and (APP / 'dist/.openai/hosting.json').is_file()
logs = [fingerprint(EVIDENCE / name) for name in ['工程兼容与情景检查.tap', '新情景最终检查.tap', '最终情景与旧界面检查.tap', '新情景检查_首次语法失败.tap', '新情景检查_准备登记读取失败.tap', '最终构建.log', '浏览器实际回读.json', '本轮实现差异.diff']]
assert 'pass 39' in (EVIDENCE / '工程兼容与情景检查.tap').read_text() and 'fail 0' in (EVIDENCE / '工程兼容与情景检查.tap').read_text()
assert 'pass 6' in (EVIDENCE / '新情景最终检查.tap').read_text() and 'fail 0' in (EVIDENCE / '新情景最终检查.tap').read_text()
assert 'pass 10' in (EVIDENCE / '最终情景与旧界面检查.tap').read_text() and 'fail 0' in (EVIDENCE / '最终情景与旧界面检查.tap').read_text()
assert 'Prepared Sites build' in (EVIDENCE / '最终构建.log').read_text()
report = {
    'schema_version': '0.1.conditional-source-draft-software-delivery', 'created_at': datetime.now().astimezone().isoformat(),
    'scope': '26件冻结来源与两独立可保存草稿；独立原字节和浏览器实际回读；不重跑研究生产',
    'status_axes': {'source_intake': 'completed_verified_original_bytes', 'editable_saved_drafts': 'completed_actual_browser_and_disk_reopen', 'research_input_adoption': 'not_completed_no_new_adoption', 'scientific_results': 'not_completed_no_new_results'},
    'manifest': fingerprint(MANIFEST), 'original_source_zip': fingerprint(ORIGINAL_ZIP),
    'source_group_count': 3, 'original_file_count': 26, 'original_bytes': 469234, 'originals': originals,
    'downloaded_json': json_identity, 'downloaded_zip': zip_identity,
    'json_and_zip_project_exact_bytes_equal': True,
    'outer_zip_counts': {'payload_files': len(payload), 'extra_member_receipts': 1, 'file_members_including_receipt': len(payload) + 1, 'directory_entries': len([n for n in outer.namelist() if n.endswith('/')]), 'all_entries': len(outer.namelist()), 'new_conditional_payload_files': 30},
    'nested_original_zip_counts': {'raw_original_files': 26, 'manifest_files': 1, 'file_members': len(source.namelist()), 'directory_entries': 0},
    'current_park_table': {'rows': 7, 'columns': 17, 'original_string_cells': 119, 'empty_string_cells': 39, 'utf8_bom_retained': csv_raw.startswith(b'\xef\xbb\xbf'), 'all_cells_browser_json_zip_equal': True},
    'park_fact_count': 7, 'webpage_identity_count': 8, 'historical_raw_files': 7,
    'ncdc_preview': {'rows_including_header': 11, 'annual_titles': 10, 'raster_files_obtained': 0, 'all_browser_cells_original_equal': True},
    'candidate_identity_and_time_boundaries': park['existing_OSM_candidate'],
    'drafts': project['conditionalScenarioDrafts'],
    'software_source_statement_preserved': {'original_definition_actual_software_implementation_verified': False, 'new_software_acceptance_is_only_in_this_receipt': True},
    'legacy_protection': {'baseline_json': fingerprint(BASE_JSON), 'baseline_zip': fingerprint(BASE_ZIP), 'field_presence_preserved_in_legacy_parser_test': True, 'keys_exactly_equal': legacy_keys, 'research_registers': 2, 'preparation_registers': 1, 'preparation_original_files': 14, 'supplement_registers': 5, 'source_preparation_original_files': 31, 'source_geometry_original_files': 72, 'old_outer_payload_members_exact_bytes_retained': len(old_payload_unchanged)},
    'browser_proof': fingerprint(EVIDENCE / '浏览器实际回读.json'),
    'rejected_imports': [{k: v for k, v in e.items() if k != 'identity'} for e in rejected],
    'after_rejections_drafts_local_saved_restored_exactly_equal': True,
    'additional_post_rejection_disk_comparison': {'verified': False, 'browser_event': event('extra_download_diagnostics')['events'], 'note': '额外第三件校验下载收到浏览器canceled事件，未计作磁盘文件；主JSON与ZIP均已实际落盘并重开通过'},
    'explicit_prepared_download_link': {'implemented': True, 'extra_download_verified': False, 'persistent_blob_url_cleaned_up_when_replaced': True},
    'verification': {'compatible_project_checks_passed': 39, 'final_conditional_checks_passed': 6, 'final_conditional_and_legacy_ui_checks_passed': 10, 'overlapping_checks_not_summed': True, 'build_passed': True, 'final_browser_error_or_warn_logs': event('final_browser_logs')['logs'], 'initial_failed_checks_retained': ['测试语法中await位置修复；保留首次失败日志', '准备登记单对象测试读取改为单元素列表；保留失败日志'], 'development_ui_recheck': '开发组件更新后页面回到入口，按最终版本重新重开；原下载与本地保存保留'},
    'implementation': code, 'built_artifacts': build, 'verification_evidence': logs,
    'current_04_boundary': {'plan_reference_only': fingerprint(ROOT / '04_物理降温与真实可获取的热舒适的错位/研究计划_论文主线修订版_v1.1_2026-10-06.md'), 'paper_focus': '绿色与冷环境累积机会、固定资源网络约束和人口热压力匹配', 'future_platform_applications': '优化、连接比较与推荐损失留待后续平台应用，不作为当前论文必需能力', 'plan_or_population_bridge_added_to_26_bundle': False, 'plan_parameters_auto_adopted': False},
}
REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
draft_lines = '\n'.join(f"- {d['mode_id']}：`{d['draft_id']}`，第{d['version']}版，评价时间 `{d['evaluation_time']}`，{len(d['source_references'])}条完整候选引用。" for d in project['conditionalScenarioDrafts'])
READABLE.write_text(f'''# 两类情景与条件来源的软件交付

26件原件已经独立接入；“统一开放假设”和“现实条件核对”可分别编辑、保存、刷新恢复及交接。实际从磁盘重开JSON和ZIP后，两份草稿、26原件、119原字符串和11行预览均与保存内容一致。当前网页右上角“情景”进入两份草稿。

## 两份草稿

{draft_lines}

草稿说明及评价时间是本轮回读检查填写，起点落位、规则、温度与面积资格仍待研究确认。未填写项保持未知；宽度无默认值。两个草稿的7个研究输入槽和7个科学结果槽均为null。LST、行人气温与人体舒适分别记录。

统一开放排除建筑、机动车车道、水面和已知不可步行地表，保留人行部分；道路中心线不充当车道面，过街与连通需明示。现实条件按分区、来源、时段审阅；北大门名称未绑定门点或受体，报告亩数不转成服务面积。已有/待补支持在普通界面显示，全部原字段与引用在详情中审阅。

## 实际保存与来源回读

- 两份草稿编辑后保存，刷新并恢复，身份、版本和全部字段逐项相等。
- JSON和ZIP实际下载到磁盘，并分别在平台重开。各重开后逐件读取26原文，7×17的119个字符串、39个空字符串及NCDC全部11行与原件相等。
- 完整审阅7条事实、8网页身份、7份历史，实际测试分区、来源、公告日、事件日和精度筛选。WJ05公告2022-09-18与事件2022-09-19分开；其评价时间早于事件时显示不可套用。WJ07发布日期来自O08索引，生效时点未知；未知结束未认作无限期。
- NCDC只有10个年度标题加表头，共11行，取得栅格0件。预览没有2020行不证明没有2020数据，100米年份描述不证明成都2020文件已取得。
- 错误对象短键、错误门绑定、目录升级栅格和null来源登记均在实际导入时拒绝。拒绝后再保存并刷新恢复，两草稿完整身份、说明、引用和科学空槽逐字段不变。

## 磁盘交接件与计数

- [JSON]({json_path})：{json_identity['bytes']:,}字节，SHA256 `{json_identity['sha256']}`。
- [ZIP]({zip_path})：{zip_identity['bytes']:,}字节，SHA256 `{zip_identity['sha256']}`。ZIP中project.json与JSON下载件原字节一致。
- 外层ZIP：{len(payload)}个payload文件，另1个成员回执，4个目录项，共{len(outer.namelist())}项。新增条件来源/草稿30个payload文件，目录不当作文件计数。
- 完整内层原件ZIP：26原件加1清单，27文件成员，0目录；原件合计469,234字节。清单及原ZIP分别为清单指纹与归档指纹，不能互换。

原科研2登记、准备14原件、补充5登记、31与72来源包及其原科学状态保持。旧外层ZIP中除工程、交接说明和成员回执外，{len(old_payload_unchanged)}个原成员原字节不变。原产品定义的actual_software_implementation_verified=false没有修改；本轮软件验收写在独立[结构化收据]({REPORT})中。

追加下载限制：为工程生成文件增加了可直接点击的“下载已生成文件”入口，临时URL在替换时释放。浏览器对额外第三件校验下载返回downloadWillBegin后立即canceled，0字节接收，未得到磁盘文件；这次额外下载未记为通过。主JSON/ZIP的两次实际下载、磁盘指纹和重开证据已独立完成。收据保留取消事件，不推断其具体原因。

## 验证与当前边界

针对工程兼容与情景行为的39项检查通过；新增准备原件引用验证后的最终6项情景检查通过；最终实现下的6项情景及4项原几何界面检查共10项通过。这些集合重叠，不相加。构建通过。保留两次测试失败及修复日志：首次测试await语法位置、准备登记单对象读取方式；均已修复。开发组件更新时页面回到入口，随后按最终实现重新重开完成核对。最终浏览器警告/错误日志为{len(event('final_browser_logs')['logs'])}条。代码、构建、日志、实际浏览器记录和下载指纹均在收据中。

04最新v1.1的论文主线是绿色/冷环境累积机会、固定资源网络约束与人口热压力匹配。优化、候选连接与推荐损失移到后续平台应用，不列为论文必需能力。v1.1与新人口桥接包没有加入冻结26件原件ZIP，速度、时间、温度、面积等计划参数没有自动采用。

本轮完成资料接入和可保存草稿。新的研究输入采用与科学计算尚未完成，没有新路线、细尺度温度、人体舒适、公平或最优改造结果；保存成功和地图光效不代表这些能力。原研究生产与地图光效验收分别保留。
''', encoding='utf-8')
print(json.dumps({'receipt': fingerprint(REPORT), 'readable': fingerprint(READABLE), 'payload': len(payload), 'directories': 4, 'originals': 26, 'drafts': 2, 'status': 'verified'}, ensure_ascii=False))
