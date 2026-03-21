# GitHub Pages Deployment Guide

This project is prepared to deploy the static `build/` output to GitHub Pages using GitHub Actions.

## Files Added

- `.github/workflows/deploy-pages.yml`

This workflow:

- Runs on pushes to `main`
- Also supports manual run from `Actions`
- Installs dependencies with `npm ci`
- Builds the app with `npm run build`
- Publishes the `build/` folder to GitHub Pages

## One-Time GitHub Setup

After pushing this repository to GitHub:

1. Open your repository on GitHub
2. Go to `Settings`
3. Open `Pages`
4. Under `Build and deployment`, choose:
   - `Source`: `GitHub Actions`

That is the only required Pages setting for this workflow.

## Commands to Push to GitHub

Run these commands from the project root after creating the GitHub repository:

```bash
git init
git add .
git commit -m "Prepare GitHub Pages deployment"
git branch -M main
git remote add origin https://github.com/Rnai66/Moneyma.git
git push -u origin main
```

If this repository already exists locally and already has a remote:

```bash
git add .
git commit -m "Add GitHub Pages deployment workflow"
git push origin main
```

## What Gets Published

The workflow publishes the `build/` folder.

Important public URLs after Pages is enabled will typically be:

- Main site:
  `https://rnai66.github.io/Moneyma/`
- Privacy policy:
  `https://rnai66.github.io/Moneyma/privacy-policy.html`

## Manual Deploy Trigger

You can also deploy manually:

1. Open `Actions` in GitHub
2. Select `Deploy GitHub Pages`
3. Click `Run workflow`

## Before Using the Privacy Policy URL in Google Play

Make sure:

- The Pages site is publicly accessible
- `privacy-policy.html` loads correctly
- The contact email shown on the page is correct

## Notes

- This workflow assumes your default release branch is `main`
- If you use another branch, update `.github/workflows/deploy-pages.yml`
- This guide is prepared for repository:
  `https://github.com/Rnai66/Moneyma`
