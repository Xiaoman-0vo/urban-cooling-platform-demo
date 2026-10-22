"""Prepare whole-city display lights from held classified rasters, without resampling."""
import hashlib
import json
from pathlib import Path

import numpy as np
import openpyxl
import rasterio
from rasterio.features import geometry_mask
from rasterio.windows import Window, from_bounds
from pyproj import Transformer
from shapely.geometry import LineString, Point, box, mapping, shape
from shapely.ops import polygonize_full, transform, unary_union
from shapely.prepared import prep

APP = Path(__file__).resolve().parents[1]
DATA = APP / 'public/data'
EVIDENCE = APP / 'evidence/四川全域与研究区选址_20261006'
WAREHOUSE = APP.parent.parent / '城市数据'
BASE = WAREHOUSE / '数据/06_土地利用与建成环境/论文开放数据'
CLCD = BASE / 'CLCD中国30米年度土地覆盖/Zenodo_18180184/中国/1985_1990-2025/CLCD_v01_2020_albert.tif'
LEGEND = CLCD.parent / 'CLCD_classificationsystem.xlsx'
UBGG = BASE / '中国36城蓝绿灰景观/Zenodo_8352777/中国36城/v1.0发布包/chengdu_UBGG_3m.tif'
OSM = EVIDENCE / '成都导航_OSM完整原始边界.json'


def hash_file(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def write(name, value):
    path = DATA / name
    encoded = json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
    path.write_text(encoded)
    assert json.loads(path.read_text()) == json.loads(encoded)
    return {'file': name, 'features': len(value.get('features', [])), 'bytes': path.stat().st_size, 'sha256': hash_file(path)}


def city_boundary():
    value = json.loads(OSM.read_text())
    nodes = {e['id']: (e['lon'], e['lat']) for e in value['elements'] if e['type'] == 'node'}
    ways = {e['id']: e for e in value['elements'] if e['type'] == 'way'}
    relation = next(e for e in value['elements'] if e['type'] == 'relation' and e['id'] == 2110264)
    assert relation['tags']['division_code'] == '510100'

    def polygons(role):
        members = [m for m in relation['members'] if m['role'] == role]
        assert all(m['type'] == 'way' for m in members)
        lines = [LineString([nodes[n] for n in ways[m['ref']]['nodes']]) for m in members]
        if not lines:
            return None
        p, cuts, dangles, invalid = polygonize_full(unary_union(lines))
        assert cuts.is_empty and dangles.is_empty and invalid.is_empty, 'Unclosed source boundary; no invented joins.'
        return unary_union(p.geoms)

    city = polygons('outer').difference(polygons('inner'))
    assert city.is_valid and not city.is_empty
    study = shape(json.loads((DATA / 'study_selection_boundary.geojson').read_text())['features'][0]['geometry'])
    assert city.covers(study)
    feature = {'type': 'Feature', 'id': 'OSM/relation/2110264', 'geometry': mapping(city),
               'properties': {'name': '成都市', 'source': 'OpenStreetMap', 'navigation_only': True,
                              'selection_boundary': False, 'relation_id': 2110264}}
    return city, {'type': 'FeatureCollection', 'features': [feature]}, {
        **json.loads((EVIDENCE / '成都导航_OSM获取记录.json').read_text()),
        'raw_path': str(OSM), 'raw_sha256': hash_file(OSM),
        'outer_way_count': sum(m['role'] == 'outer' for m in relation['members']),
        'inner_way_count': sum(m['role'] == 'inner' for m in relation['members']),
        'no_gap_bridging': True, 'no_boundary_simplification': True}


def lights(path, city, name, green_codes, known_codes, step, resolution):
    features, class_counts = [], {}
    totals = {'pixels_inside_navigation_city': 0, 'known_pixels': 0, 'unknown_or_nodata_pixels': 0,
              'green_pixels': 0, 'blocks_with_known_pixels': 0, 'blocks_with_green_pixels': 0}
    prepared_city = prep(city)
    with rasterio.open(path) as ds:
        assert ds.count == 1 and ds.res == (resolution, resolution)
        projected = transform(Transformer.from_crs(4326, ds.crs, always_xy=True).transform, city)
        back = Transformer.from_crs(ds.crs, 4326, always_xy=True)
        window = from_bounds(*projected.bounds, transform=ds.transform)
        col0 = max(0, int(np.floor(window.col_off / step)) * step)
        row0 = max(0, int(np.floor(window.row_off / step)) * step)
        col1 = min(ds.width, int(np.ceil((window.col_off + window.width) / step)) * step)
        row1 = min(ds.height, int(np.ceil((window.row_off + window.height) / step)) * step)
        crs, source_transform = str(ds.crs), list(ds.transform)[:6]
        for row in range(row0, row1, step):
            h = min(step, row1 - row)
            strip_window = Window(col0, row, col1 - col0, h)
            values = ds.read(1, window=strip_window)
            original_valid = ds.read_masks(1, window=strip_window) > 0
            inside = geometry_mask([mapping(projected)], out_shape=values.shape,
                                  transform=ds.window_transform(strip_window), invert=True, all_touched=False)
            valid = inside & original_valid & np.isin(values, known_codes)
            green = valid & np.isin(values, green_codes)
            totals['pixels_inside_navigation_city'] += int(inside.sum())
            totals['known_pixels'] += int(valid.sum())
            totals['unknown_or_nodata_pixels'] += int((inside & ~valid).sum())
            totals['green_pixels'] += int(green.sum())
            codes, counts = np.unique(values[inside], return_counts=True)
            for code, count in zip(codes, counts):
                class_counts[str(code)] = class_counts.get(str(code), 0) + int(count)
            for offset in range(0, values.shape[1], step):
                col = col0 + offset
                mask = green[:, offset:offset + step]
                n_valid = int(valid[:, offset:offset + step].sum())
                n_green = int(mask.sum())
                if not n_valid:
                    continue
                totals['blocks_with_known_pixels'] += 1
                if not n_green:
                    continue
                totals['blocks_with_green_pixels'] += 1
                # The screen marker is anchored at a real classified green pixel,
                # nearest the block centre, never at a fabricated/random location.
                locations = np.argwhere(mask)
                centre = np.array([(h - 1) / 2, (mask.shape[1] - 1) / 2])
                r, c = locations[np.argmin(((locations - centre) ** 2).sum(axis=1))]
                source_row, source_col = row + int(r), col + int(c)
                x, y = ds.transform * (source_col + 0.5, source_row + 0.5)
                lon, lat = back.transform(x, y)
                assert prepared_city.covers(Point(lon, lat))
                features.append({'type': 'Feature', 'id': f'{name}/{row}/{col}',
                    'geometry': {'type': 'Point', 'coordinates': [lon, lat]},
                    'properties': {'display_only': True, 'classification_source': name,
                        '__display_green_share': n_green / n_valid,
                        'native_green_pixels': n_green, 'native_valid_pixels': n_valid,
                        'block_row': row, 'block_col': col, 'block_size_px': step,
                        'source_row': source_row, 'source_col': source_col,
                        'native_sample_class': int(values[int(r), offset + int(c)]),
                        'research_admitted': False}})
        # Independent single-pixel reads confirm first/middle/last display anchors.
        checks = []
        for f in [features[0], features[len(features) // 2], features[-1]]:
            p = f['properties']
            reread = int(ds.read(1, window=Window(p['source_col'], p['source_row'], 1, 1))[0, 0])
            assert reread == p['native_sample_class'] and reread in green_codes
            checks.append({'id': f['id'], 'source_pixel_class': reread, 'point_inside_city': True})
    assert totals['known_pixels'] + totals['unknown_or_nodata_pixels'] == totals['pixels_inside_navigation_city']
    assert sum(f['properties']['native_green_pixels'] for f in features) == totals['green_pixels']
    assert len(features) == totals['blocks_with_green_pixels'] and 0 < len(features) <= 10000
    return {'type': 'FeatureCollection', 'features': features}, {
        'source_path': str(path), 'sha256': hash_file(path), 'source_crs': crs,
        'native_transform': source_transform, 'native_resolution_m': resolution,
        'green_class_codes': green_codes, 'known_class_codes': known_codes,
        'display_block_width_m': step * resolution, 'source_window': [col0, row0, col1 - col0, row1 - row0],
        'native_pixels_resampled': False, 'point_position': 'nearest_real_green_pixel_to_block_centre',
        'totals': totals, 'raw_class_counts_inside_city': class_counts, 'single_pixel_readbacks': checks}


def city_effects(city):
    """A clipped display lattice and sweep; these are not roads or terrain data."""
    forward = Transformer.from_crs(4326, 32648, always_xy=True).transform
    backward = Transformer.from_crs(32648, 4326, always_xy=True).transform
    projected = transform(forward, city)
    x0, y0, x1, y1 = projected.bounds
    features = []

    def append(identity, geometry, kind, position):
        if geometry.is_empty:
            return
        # GEOS can retain sub-micron endpoint residuals after an intersection.
        # Audit those directly; do not grow the navigation mask or study area.
        outside = geometry.difference(city)
        assert geometry.is_valid and outside.area < 1e-12 and outside.length < 1e-9
        features.append({'type': 'Feature', 'id': identity, 'geometry': mapping(geometry),
            'properties': {'__city_fx_kind': kind, '__display_scan_position': position,
                           'display_only': True, 'research_admitted': False,
                           'role': 'decorative_city_lattice_or_sweep_not_roads_terrain_or_research_grid'}})

    # Metre spacing only controls visual density. The lattice never becomes a
    # 100m research grid or a road/contour source, and all lines stop at the city.
    for axis, lower, upper in [('x', x0, x1), ('y', y0, y1)]:
        for value in range(int(np.ceil(lower / 1000)) * 1000, int(upper), 1000):
            line = LineString([(value, y0), (value, y1)]) if axis == 'x' else LineString([(x0, value), (x1, value)])
            clipped = line.intersection(projected)
            if clipped.is_empty:
                continue
            geographic = transform(backward, clipped).intersection(city)
            append(f'lattice/{axis}/{value}', geographic, 'grid_major' if value % 4000 == 0 else 'grid_minor',
                   (value - lower) / (upper - lower))
    lon0, lat0, lon1, lat1 = city.bounds
    for index in range(64):
        left, right = lon0 + (lon1 - lon0) * index / 64, lon0 + (lon1 - lon0) * (index + 1) / 64
        append(f'sweep/{index}', city.intersection(box(left, lat0, right, lat1)), 'scan_band', (index + 0.5) / 64)
    bands = [shape(f['geometry']) for f in features if f['properties']['__city_fx_kind'] == 'scan_band']
    assert city.symmetric_difference(unary_union(bands)).area < 1e-12, 'The sweep must cover the entire city.'
    return {'type': 'FeatureCollection', 'features': features}, {
        'role': 'decorative_city_lattice_and_scan_not_observations',
        'clipped_to_navigation_city': True, 'scan_covers_entire_city': True,
        'lattice_display_spacing_m': 1000, 'major_lattice_display_spacing_m': 4000,
        'scan_bands': len(bands), 'features': len(features),
        'clip_endpoint_roundoff_limit_degrees': 1e-9, 'mask_or_study_buffer_added': False,
        'not_research_grid': True, 'not_roads_or_terrain': True}


def main():
    assert hash_file(CLCD) == '2d4f05bac50ac25ca2c8bd214f02ec0974348550c0a94fa3825cdc49f22f23e1'
    assert hash_file(UBGG) == '1799ed4a381549bb13dd3f591448165daa729ab0d89fc14fb17d37e8efcab8cb'
    legend = dict((row[0], row[1]) for row in list(openpyxl.load_workbook(LEGEND, read_only=True, data_only=True).active.values)[1:])
    assert [legend[n] for n in [2, 3, 4]] == ['Forest', 'Shrub', 'Grassland']
    city, boundary, boundary_source = city_boundary()
    broad, broad_source = lights(CLCD, city, 'CLCD_2020', [2, 3, 4], list(range(1, 10)), 50, 30)
    urban, urban_source = lights(UBGG, city, 'UBGG_3m', [2, 3], [0, 1, 2, 3, 4], 150, 3)
    effects, effects_context = city_effects(city)
    assets = [write('chengdu_navigation_boundary.geojson', boundary),
              write('chengdu_city_green_points.geojson', broad),
              write('chengdu_urban_green_points.geojson', urban),
              write('chengdu_city_effects.geojson', effects)]
    context = {'version': 'chengdu_display_lights_v1_20261006', 'default_region': '成都',
        'chengdu_bounds': list(city.bounds), 'assets': assets, 'city_effects': effects_context,
        'sources': {'city_boundary': boundary_source,
            'CLCD_2020': {**broad_source, 'source_url': 'https://zenodo.org/records/18180184',
                          'published_version': '1.0.5', 'license': 'CC BY 4.0',
                          'published_md5_verified': '1274285bb18f9b1d443a3cc906b1310c',
                          'legend_path': str(LEGEND), 'legend_sha256': hash_file(LEGEND)},
            'UBGG_3m': {**urban_source, 'source_url': 'https://zenodo.org/records/8352777',
                        'authors': ['Zhiyu Xu', 'Shuqing Zhao'], 'published_version': 'v1.0',
                        'time_alignment_validated': False,
                        'class_names': {'2': 'tree_shrub_projection', '3': 'grass_class'}}},
        'research_admission_changed': False, 'existing_G02_changed': False,
        'display_share_is_G02': False, 'selectable_boundary_changed': False,
        'limitations': ['These lights are a display derivative of supplied classifications, not cooling or service results.',
            'City-wide CLCD 2020 and the finer UBGG extent retain separate sources and meanings.',
            'NoData or unknown pixels are excluded, never interpreted as no vegetation.',
            'OSM current city boundary is navigation only; 2021 study selection remains unchanged.']}
    write('chengdu_green_context.json', context)
    (DATA / 'CHENGDU_GREEN_DATA_SOURCES.md').write_text(
        '# 成都全域植被光效\n\n默认进入成都全域，四川保留为切换视野。\n\n'
        '远景来源：本机已有 CLCD 2020 原始分类（发布包 1.0.5，30m，CC BY 4.0）。'
        '按发布者图例读取 2 林地、3 灌木、4 草地；不把农田填成城市绿地。'
        '每 50×50 个原像元汇总为展示块，光点落在块内真实分类像元的中心。\n\n'
        '城区细景来源：本机已有 UBGG 3m 分类（2 树木灌木投影、3 草地），'
        '每 150×150 个原像元汇总为展示块；只显示原文件实际覆盖处。'
        '研究区继续保留原 c4_min0 / G02 候选节点，未替换原字段。\n\n'
        '全域扫描与背景线网沿真实成都导航边界裁切，覆盖全市。'
        '它们是科幻界面装饰，不是道路、等高线、实测数据或100m研究网格。'
        '扫描亮度随时间移动，边界和植被光点持续呼吸；全部效果与选址边界独立。\n\n'
        '成都外轮廓为 OSM relation 2110264 当前导航边界，保留原外环及内环，无补线、无简化。'
        '© OpenStreetMap contributors，ODbL 1.0。区内选址仍用既有 2021 二环操作性研究边界。\n\n'
        '所有新光点只供浏览。没有时点准入、模型输入替换、降温计算或服务可达性结果。'
        '缺失像元保持缺失。来源版本、坐标、原像元计数、哈希和单像元回读见 chengdu_green_context.json。\n')
    print(json.dumps({'assets': assets, 'city_bounds': list(city.bounds),
                      'CLCD': broad_source['totals'], 'UBGG': urban_source['totals']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
