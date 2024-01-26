import { Client } from '@notionhq/client'
import { Octokit } from 'octokit'

type User = {
	login: string
	avatar_url: string
	gravatar_id: string
	html_url: string
}

type Issue = {
	title: string
	number: number
	html_url: string
	body: string
	created_at: string
	updated_at: string
	created_by: User
	assignees: User[]
	repo: string
	status: boolean
}

const octokit = new Octokit({
	auth: process.env.GITHUB_TOKEN,
})

const notion = new Client({
	auth: process.env.NOTION_TOKEN,
})

const GITHUB_ORGS = ['VSWSL', 'VSPlayStore', 'BackupRunner', 'AutomationRunner']

async function getReposOfUser(username: string): Promise<string[]> {
	const repo_names = []

	const repos = await octokit.request('GET /users/{username}/repos', {
		username: username,
		headers: {
			'X-GitHub-Api-Version': '2022-11-28',
		},
	})

	for (const repo of repos.data) {
		repo_names.push(repo.full_name as string)
	}

	return repo_names
}

async function getReposOfORG(org: string): Promise<string[]> {
	const repo_names = []

	const repos = await octokit.request('GET /orgs/{org}/repos', {
		org: org,
		headers: {
			'X-GitHub-Api-Version': '2022-11-28',
		},
	})

	for (const repo of repos.data) {
		repo_names.push(repo.full_name as string)
	}

	return repo_names
}

async function main() {
	let repos = await getReposOfUser('vineelsai26')

	for (const org of GITHUB_ORGS) {
		const org_repos = await getReposOfORG(org)
		repos = repos.concat(org_repos)
	}

	let issues = []

	for (const repo of repos) {
		const issue_request = await octokit.request(
			'GET /repos/{owner}/{repo}/issues?state=all&per_page=100',
			{
				owner: repo.split('/')[0],
				repo: repo.split('/')[1],
				headers: {
					'X-GitHub-Api-Version': '2022-11-28',
				},
			}
		)

		for (const issue of issue_request.data) {
			const repo_issues = {
				title: issue.title,
				number: issue.number,
				html_url: issue.html_url,
				body: issue.body,
				created_at: issue.created_at,
				updated_at: issue.updated_at,
				created_by: issue.user,
				assignees: issue.assignees,
				repo: repo,
				status: issue.state === 'open' ? false : true,
			} as Issue

			issues.push(repo_issues)
		}
	}

	for (const issue of issues) {
		const query = await notion.databases.query({
			database_id: process.env.NOTION_DATABASE_ID!,
			filter: {
				property: 'URL',
				url: {
					equals: issue.html_url,
				},
			},
		})

		const properties = {
			Name: {
				title: [
					{
						text: {
							content: issue.title,
						},
					},
				],
			},
			Status: {
				checkbox: issue.status,
			},
			ORG: {
				select: {
					name: issue.repo.split('/')[0],
				},
			},
			Repo: {
				select: {
					name: issue.repo
				},
			},
			'Issue Id': {
				number: issue.number,
			},
			URL: {
				url: issue.html_url,
			},
			Tags: {
				multi_select: issue.html_url.includes('/issues/')
					? [
							{
								name: 'Issue',
							},
					  ]
					: [
							{
								name: 'Pull Request',
							},
					  ],
			},
			Description: {
				rich_text: [
					{
						text: {
							content:
								issue.body !== null
									? issue.body.slice(0, 2000)
									: '',
						},
					},
				],
			},
			'Created At': {
				date: {
					start: issue.created_at,
				},
			},
			'Updated At': {
				date: {
					start: issue.updated_at,
				},
			},
			'Created By': {
				rich_text: [
					{
						text: {
							content: issue.created_by.login,
						},
					},
				],
			},
		}

		if (query.results.length > 0) {
			await notion.pages.update({
				page_id: query.results[0].id,
				properties: properties,
			})
		} else {
			await notion.pages.create({
				parent: {
					database_id: process.env.NOTION_DATABASE_ID!,
				},
				properties: properties,
			})
		}
	}
	console.log('Done')
}

main()
