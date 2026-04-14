import * as core from '@actions/core'
import { context } from '@actions/github'
import { BuildGithubNotificationCard } from './card'
import { PostToFeishu, sign_with_timestamp } from './feishu'

export async function PostGithubEvent(): Promise<number | undefined> {
  const webhook = core.getInput('webhook')
    ? core.getInput('webhook')
    : process.env.FEISHU_BOT_WEBHOOK || ''
  const signKey = core.getInput('signkey')
    ? core.getInput('signkey')
    : process.env.FEISHU_BOT_SIGNKEY || ''

  const webhookId = webhook.slice(webhook.indexOf('hook/') + 5)
  const tm = Math.floor(Date.now() / 1000)
  const sign = sign_with_timestamp(tm, signKey)

  console.log(context.eventName, context.payload)

  const actor = context.actor
  const eventType = context.eventName
  const payload = context.payload
  const repo = context.payload.repository?.name || ''

  let status = context.payload.action || ''
  let etitle =
    context.payload.issue?.html_url ||
    context.payload.pull_request?.html_url ||
    ''
  let detailurl = ''

  const prTitleLink = payload.pull_request
    ? `[${payload.pull_request.title}](${payload.pull_request.html_url})`
    : ''

  switch (eventType) {
    case 'issue_comment': {
      const comment = context.payload.comment
      etitle = `[No.${context.payload.issue?.number} ${context.payload.issue?.title}](${context.payload.issue?.html_url})\n\n${comment?.body}\n\n`
      detailurl = comment?.html_url || ''
      break
    }
    case 'pull_request':
      const pr = context.payload.pull_request
      const prBody = pr?.body || ''
      etitle = `${prTitleLink}\n\n${prBody}\n\n`
      break
    case 'pull_request_review':
      const review = payload.review
      status = review.state || status
      const reviewBody = review.body || ''
      etitle = `${prTitleLink}\n\n${reviewBody}\n\n`
      break
    case 'pull_request_review_thread':
      const comments = payload.thread.comments
      const allCommentBody = comments
        .map((c: { body: string }) => c.body)
        .join('\n\n')
      etitle = `${prTitleLink}\n\n${allCommentBody}\n\n`
      break
    case 'pull_request_review_comment':
      const comment = payload.comment
      if (!comment) {
        break
      }
      const commentBody = comment.body || ''
      etitle = `${prTitleLink}\n\n${commentBody}\n\n`
      detailurl = comment.html_url || ''
      break
    case 'push': {
      const head_commit = context.payload['head_commit']
      console.log(context.payload['ref'])
      const ptext =
        context.payload['ref'].indexOf('refs/tags/') !== -1
          ? `tag: ${context.payload['ref'].slice(
              context.payload['ref'].indexOf('refs/tags/') + 10
            )}`
          : context.payload['ref'].indexOf('refs/heads/') !== -1
            ? `branch: ${context.payload['ref'].slice(
                context.payload['ref'].indexOf('refs/heads/') + 11
              )}`
            : ''
      etitle = `${ptext}\n\nCommits: [${head_commit['id']}](${head_commit['url']})\n\n${head_commit['message']}`
      status =
        context.payload['created'] === true
          ? 'created'
          : context.payload['forced'] === true
            ? 'force updated'
            : status
      detailurl = context.payload['compare']
      break
    }
    case 'release': {
      const release = context.payload.release
      etitle = `${release['name']}\n${release['body']}\n${release['tag_name']}${release['prerelease'] === true ? '  prerelease' : ''}`
      status = context.payload.action || ''
      detailurl = release['html_url']
      break
    }
    default:
      break
  }

  const color = 'blue'
  const cardmsg = BuildGithubNotificationCard(
    tm,
    sign,
    repo,
    eventType,
    color,
    actor,
    status,
    etitle,
    detailurl
  )
  return PostToFeishu(webhookId, cardmsg)
}
