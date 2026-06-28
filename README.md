# 応援歌データベース

NPB 応援歌管理アプリ。Notion をデータベースとして使用。

## セットアップ

### 1. リポジトリをクローン

```bash
git clone https://github.com/YOUR_NAME/ouen-db.git
cd ouen-db
npm install
```

### 2. 環境変数を設定

`.env.local.example` をコピーして `.env.local` を作成：

```bash
cp .env.local.example .env.local
```

`.env.local` を編集：

```
NOTION_SECRET=secret_xxxx   # Notion Integration のシークレットキー
NOTION_DATABASE_ID=1ab8b9006adc825891ad81d43963eab0
```

#### Notion Integration の作り方
1. https://www.notion.so/my-integrations にアクセス
2. 「新しいインテグレーション」を作成
3. シークレットキーをコピーして `NOTION_SECRET` に貼り付け
4. 応援歌データベースを開き、右上「…」→「コネクト」→ 作成したインテグレーションを追加

### 3. ローカルで起動

```bash
npm run dev
```

http://localhost:3000 で確認

## Vercel へのデプロイ

1. GitHub にプッシュ
2. https://vercel.com でリポジトリをインポート
3. 「Environment Variables」に以下を追加：
   - `NOTION_SECRET`
   - `NOTION_DATABASE_ID`
4. デプロイ！

## 機能

- 応援歌の一覧表示（チーム・キーワードでフィルター）
- 応援歌の追加・編集・削除
- チームの追加（Notion の select オプションに動的追加）
- ページネーション（50件ごと、「さらに読み込む」ボタン）
