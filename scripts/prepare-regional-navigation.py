"""Read held source archives; prepare lightweight, source-backed navigation only."""
import hashlib
import json
from pathlib import Path
import shutil
import zipfile

import geopandas as gpd
from shapely.geometry import mapping, shape

APP = Path(__file__).resolve().parents[1]
PROJECT = APP.parent
DATA = APP / 'public' / 'data'
WAREHOUSE = PROJECT.parent / '城市数据'
NATURAL_EARTH = WAREHOUSE / '数据/01_行政区划与城市边界/NaturalEarth/全球基础地理矢量/全球/当前版本_2026-08-22获取'
BOUNDARY_ROOT = PROJECT / '02_不同绿色空间的相互作用/宏观研究/数据核查/二环边界核对_2026-10-02'
PROTOCOL_PATH = PROJECT / '02_不同绿色空间的相互作用/宏观研究/实施/第一步_数据与变量核查/研究区口径/研究区口径.json'
STUDY_PATH = BOUNDARY_ROOT / '成都二环候选边界_OSM2021年初_高架单向主线中心线_WGS84.geojson'


def sha256(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def source(name, **kwargs):
    archive = NATURAL_EARTH / f'{name}.zip'
    with zipfile.ZipFile(archive) as z:
        version = z.read(f'{name}.VERSION.txt').decode().strip()
    frame = gpd.read_file(f'/vsizip/{archive}/{name}.shp', engine='pyogrio', **kwargs)
    assert frame.crs.to_epsg() == 4326, 'Source CRS changed; no assumed coordinates.'
    return frame, {'path': str(archive), 'sha256': sha256(archive), 'version': version,
                   'license': 'Public domain', 'crs': 'EPSG:4326',
                   'source_url': f'https://www.naturalearthdata.com/downloads/10m-physical-vectors/' if 'rivers' in name else 'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/'}


def write(name, features):
    value = {'type': 'FeatureCollection', 'features': features}
    path = DATA / name
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf-8')
    readback = json.loads(path.read_text())
    assert len(readback['features']) == len(features)
    assert all(shape(f['geometry']).is_valid and not shape(f['geometry']).is_empty for f in features)
    return {'file': name, 'features': len(features), 'bytes': path.stat().st_size, 'sha256': sha256(path)}


def feature(identity, geometry, properties):
    return {'type': 'Feature', 'id': str(identity), 'geometry': mapping(geometry),
            'properties': {'navigation_only': True, **properties}}


def main():
    protocol = json.loads(PROTOCOL_PATH.read_text())
    assert protocol['primary_boundary'] == '2021_counterclockwise'
    declared = next(s for s in protocol['sources'] if s['boundary_key'] == protocol['primary_boundary'])
    assert sha256(Path(declared['path'])) == declared['sha256']
    study = json.loads(STUDY_PATH.read_text())
    assert len(study['features']) == 1
    study_geom = shape(study['features'][0]['geometry'])
    assert study_geom.is_valid and not study_geom.is_empty
    assert study['features'][0]['properties']['candidate_id'] == 'chengdu_second_ring_osm_2021_counterclockwise'
    fixed = gpd.read_file(declared['path'], engine='pyogrio').to_crs(4326)
    assert len(fixed) == 1 and fixed.geometry.iloc[0].hausdorff_distance(study_geom) < 1e-10

    provinces, province_source = source('ne_10m_admin_1_states_provinces', columns=['name', 'name_zh', 'iso_3166_2', 'geometry'])
    province = provinces[provinces['iso_3166_2'].eq('CN-SC')]
    assert len(province) == 1
    geometry = province.geometry.iloc[0]
    assert geometry.is_valid and geometry.covers(study_geom)
    extent = geometry.bounds
    boundary_asset = write('sichuan_boundary.geojson', [feature('CN-SC', geometry, {
        'name': '四川省', 'source': 'Natural Earth', 'source_version': province_source['version'],
        'role': 'regional_navigation_boundary_not_study_selection'})])

    rivers, river_source = source('ne_10m_rivers_lake_centerlines', bbox=extent,
                                  columns=['ne_id', 'name', 'name_zh', 'geometry'])
    river_features = []
    for row in rivers.sort_values('ne_id').itertuples():
        clipped = row.geometry.intersection(geometry)
        if clipped.is_empty:
            continue
        assert clipped.geom_type in ('LineString', 'MultiLineString')
        river_features.append(feature(row.ne_id, clipped, {
            'name': row.name_zh if isinstance(row.name_zh, str) else row.name,
            'source': 'Natural Earth', 'role': 'clipped_navigation_river_not_research_water_metric'}))
    river_asset = write('sichuan_rivers.geojson', river_features)

    places, place_source = source('ne_10m_populated_places', bbox=extent,
                                  columns=['NE_ID', 'NAME', 'NAME_ZH', 'geometry'])
    place_features = [feature(row.NE_ID, row.geometry, {
        'name': row.NAME_ZH if isinstance(row.NAME_ZH, str) else row.NAME,
        'source': 'Natural Earth', 'role': 'navigation_place_not_green_or_selectable_site'})
        for row in places.sort_values('NE_ID').itertuples() if geometry.covers(row.geometry)]
    place_asset = write('sichuan_places.geojson', place_features)

    # The gate uses the unsimplified, existing operational polygon, never the
    # province navigation geometry or an invented rectangular area.
    shutil.copyfile(STUDY_PATH, DATA / 'study_selection_boundary.geojson')
    assert (DATA / 'study_selection_boundary.geojson').read_bytes() == STUDY_PATH.read_bytes()
    study_asset = {'file': 'study_selection_boundary.geojson', 'features': 1,
                   'bytes': STUDY_PATH.stat().st_size, 'sha256': sha256(STUDY_PATH)}
    context = {
        'version': 'regional_navigation_v1_20261006', 'crs': 'EPSG:4326',
        'province_bounds': list(extent), 'study_bounds': list(study_geom.bounds),
        'study_reference_center': list(study_geom.representative_point().coords[0]),
        'sources': {'province': province_source, 'rivers': river_source, 'places': place_source,
                    'study': {'path': str(STUDY_PATH), 'sha256': sha256(STUDY_PATH),
                              'protocol_path': str(PROTOCOL_PATH), 'protocol_sha256': sha256(PROTOCOL_PATH),
                              'protocol_version': protocol['version'], 'primary_boundary': protocol['primary_boundary'],
                              'snapshot_timestamp': protocol['source_snapshot_timestamp'], 'license': protocol['licence']}},
        'assets': [boundary_asset, river_asset, place_asset, study_asset],
        'accounting': {'province_source_features': len(provinces), 'province_selected': 1,
                       'river_bbox_features': len(rivers), 'rivers_intersecting_province': len(river_features),
                       'place_bbox_features': len(places), 'places_inside_province': len(place_features)},
        'selection_policy': 'New map/coordinate/grid locations must have their centre covered by the fixed study polygon. This is a UI gate, not research admission.',
        'province_data_admitted': False, 'research_admission_changed': False,
        'limitations': ['Natural Earth is a generalized navigation reference, not the study boundary.',
                        'Province-wide navigation points are not green measurements or eligible sites.',
                        'Existing green G02 points remain Chengdu macro source candidates.',
                        'The 300m surrounding display can extend beyond the selected centre boundary.'],
    }
    out = DATA / 'regional_map_context.json'
    out.write_text(json.dumps(context, ensure_ascii=False, indent=2) + '\n')
    (DATA / 'REGIONAL_DATA_SOURCES.md').write_text(
        '# 四川导航与研究区选址\n\n'
        '四川省界、河流、城市点由本机已有 Natural Earth 原始 ZIP 制作，只供区域导航。'
        '省界 5.1.1、河流 5.0.0、城市点 5.1.2，WGS84；公有领域。\n\n'
        '可选位置边界沿用 domain_v1_20261005 的 2021 逆时针二环高架单向主线中心线围合区。'
        'WGS84 GeoJSON 逐字节复制，不简化、不改原属性。© OpenStreetMap contributors，ODbL 1.0。'
        '这是道路操作性定义，非官方行政边界或实测道路边缘。\n\n'
        '选择约束只检查新场地中心的位置；全省可浏览、导入与旧工程回读保留原记录。'
        '导航点不代表植被、降温或场地可用性。绿色光效仍来自既有成都 G02 候选节点。'
        '未因省级原始文件存在而改变任何研究准入。\n\n'
        '来源路径、版本、哈希、输入输出计数见 regional_map_context.json。'
        '重复执行脚本应产生相同文件字节。\n')
    print(json.dumps({'assets': context['assets'], 'accounting': context['accounting']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
