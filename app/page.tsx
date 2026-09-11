import Uploader from '@/components/uploader'
import { formatBytes, formatTtl } from '@/lib/format'
import { maxTtl, PLAN_ORDER, PLANS, resolvePlan } from '@/lib/plans'
import { blobConfigured } from '@/lib/store'

export const dynamic = 'force-dynamic'

export default function HomePage() {
  const plan = resolvePlan()
  const configured = blobConfigured()

  return (
    <main>
      <section className="lede">
        <h2>发文件，不必占着手机的内存。</h2>
        <p>
          丢一个文件进来，立刻拿到一条短链接 —— 微信、短信里发出去就行。
          到了你设定的时间，文件和链接一起作废。不用注册。
        </p>
      </section>

      {configured ? (
        <Uploader
          maxFileBytes={plan.maxFileBytes}
          ttls={plan.ttls}
          defaultTtl={plan.defaultTtl}
        />
      ) : (
        <div className="notice">
          <strong>存储还没接上。</strong> 在 Vercel 项目的 Storage 里创建一个 Blob
          存储并关联到本项目，平台会自动注入 <code>BLOB_READ_WRITE_TOKEN</code>，
          重新部署后即可上传。
        </div>
      )}

      <section className="section" id="plans">
        <p className="eyebrow">保留时长</p>
        <div className="plans">
          {PLAN_ORDER.map((id) => {
            const p = PLANS[id]
            return (
              <div className="plan" key={p.id} data-current={p.id === plan.id}>
                <h4>{p.label}</h4>
                <p className="price">{p.price}</p>
                <dl>
                  <dt>单文件</dt>
                  <dd>{formatBytes(p.maxFileBytes)}</dd>
                  <dt>最长保留</dt>
                  <dd>{formatTtl(maxTtl(p))}</dd>
                </dl>
                <span className="tag">
                  {p.id === plan.id ? '当前生效' : p.available ? '可用' : '即将开放'}
                </span>
              </div>
            )
          })}
        </div>
        <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 14 }}>
          日常使用走第一档就够了，不需要留下任何信息。注册与付费档位用来延长保留时间、放大单文件上限，
          正在接入中。
        </p>
      </section>

      <section className="section" id="how">
        <p className="eyebrow">工作方式</p>
        <ol className="steps">
          <li>
            <span className="n">1</span>
            <span>
              文件从你的浏览器直接传到对象存储，不经过中间服务器转发，所以几个 G 的视频也传得动。
            </span>
          </li>
          <li>
            <span className="n">2</span>
            <span>
              分享链接只包含一个随机短码，猜不到；到期时间写在服务端，改不了链接来延长。
            </span>
          </li>
          <li>
            <span className="n">3</span>
            <span>
              到期后下载入口立即拒绝访问，定时任务随后把文件从存储里彻底删除。你也可以随时手动撤回。
            </span>
          </li>
        </ol>
      </section>
    </main>
  )
}
