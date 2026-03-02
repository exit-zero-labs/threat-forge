# ThreatForge — Go-to-Market Strategy

## Beachhead Market

**Primary segment:** Individual developers and small security teams (2-10 people) at companies with 50-500 employees who currently use Microsoft TMT reluctantly or don't threat model at all.

**Why this segment first?** They have compliance-driven pain but not enterprise-tool budgets ($20K+/year). Most likely to discover and adopt open-source tools via GitHub and Hacker News.

**Expansion path:** Small teams → mid-market companies → OWASP community adoption → de facto standard for individual/team threat modeling.

## Pre-Launch Playbook

| Timing | Action | Channel |
|--------|--------|---------|
| W-4 | Start "build in public" thread on Twitter/X | Social |
| W-3 | Join and engage in r/netsec, r/cybersecurity, OWASP Slack | Community |
| W-3 | Blog post: "Why Threat Models Should Be Git-Diffable" | Content |
| W-2 | Create demo video (2-3 min) | YouTube |
| W-2 | Project website with download links | Web |
| W-1 | Draft HN "Show HN" post, Reddit posts, newsletter pitches | Content |
| W-1 | Email security newsletter editors (tl;dr sec, Risky Business, etc.) | Outreach |

## Launch Week

| Day | Action | Goal |
|-----|--------|------|
| Monday | Publish on GitHub, first blog post | Repo live |
| Tuesday | "Show HN: ThreatForge — OSS threat modeling with git-friendly YAML" | Front page (target: 100+ points) |
| Wednesday | Post to r/netsec, r/cybersecurity, r/devsecops | Community awareness |
| Thursday | Share on Twitter/X, LinkedIn | Developer awareness |
| Friday | Email security newsletters | Media coverage |
| Weekend | Respond to EVERY comment, issue, star, DM | 100% response rate |

## Growth Loops

### Primary: File-format virality

```
Developer uses ThreatForge
  → Commits .thf to repo
    → Teammate sees file in PR
      → Downloads ThreatForge to view/edit
        → Uses ThreatForge (loop)
```

Same mechanism that spread Terraform's `.tf` files, Prettier configs, and ESLint configs through teams.

### Secondary: Build-in-public content

```
Developer tweets/blogs about tool
  → Other developers discover it
    → They use ThreatForge (loop)
```

## Acquisition Channels

| Channel | Strategy | Cost | Priority |
|---------|----------|------|----------|
| GitHub / README | Excellent README with demo GIFs, clear install | $0 | 1 |
| Hacker News | Show HN with compelling demo | $0 | 1 |
| Reddit | Posts in r/netsec, r/cybersecurity, r/programming | $0 | 2 |
| Dev Twitter/X + Bluesky | Build in public; progress, decisions | $0 | 2 |
| OWASP Community | Contribute to TM-BOM discussions | $0 | 3 |
| YouTube / blog | Tutorials, comparison videos | $0 | 3 |
| Security conferences | BSides, OWASP chapters, DevSecOps meetups | $0-500 | 4 |

## Content Strategy (Post-Launch)

| Content Type | Frequency | Purpose |
|-------------|-----------|---------|
| Build-in-public updates | Weekly | Community engagement |
| Threat modeling tutorials | 2/month | SEO, thought leadership |
| "Threat Modeling [X] with ThreatForge" walkthroughs | 1/month | Practical value |
| Release notes | Per release | User engagement |
| "ThreatForge vs Microsoft TMT" comparison | Once | High-intent SEO |

## Kill Gates

| Phase | Success Criteria | Kill Gate | Decision Date |
|-------|-----------------|-----------|---------------|
| Launch | First 100 stars | <100 stars in first 2 weeks | 2 weeks post-launch |
| Month 3 | 1,000+ stars, 500+ downloads | 0 external contributors after 6 months | Month 9 |
| Ongoing | Enjoying building it | Dreading it for 3+ consecutive weeks | Ongoing |
