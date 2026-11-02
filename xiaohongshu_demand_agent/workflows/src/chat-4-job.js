// 聊天窗 2d：把任务单序列化成文本，交给 convertToFile 写成文件
// 数据流：1-意图(job) → 2d-生成任务JSON(job_text) → 2d2-转成文件(二进制) → 2d3-写任务文件 → 3d-回执
const src = $('1-意图').first().json;
const job = src.job;

if (!job || !job.id) {
  return [{ json: { job_text: '{}', job_id: null } }];
}

// 任务单本身就是要被后台工人读的文件：字段少、可人工查看、可手改
const job_text = JSON.stringify(job, null, 2);

return [{
  json: {
    job_id: job.id,
    job_text,
    query: job.query,
    city: job.city,
  },
}];
