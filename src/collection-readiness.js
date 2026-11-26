// 兼容旧试用容器的 execution 检查；明确区分“未启用”与可重试的依赖故障。
export function collectionUnavailable(readiness){
  return Boolean(readiness&&(readiness.enabled===false||readiness.state==='disabled'||
    readiness.checks?.some(check=>check.id==='execution'&&check.ready===false)));
}

export function collectionReadinessRetryDelay(readiness){
  return collectionUnavailable(readiness)?null:15000;
}
