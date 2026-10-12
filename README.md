# 縁図 — 神社の知識関係マップ（GitHub Pages / YAML版）

**神社・建築様式・式内社・社格・神々・神宝を、関連する円をたどりながら調べるサイトです。**

- HTMLにデータを書き込みません。YAMLに情報を書き、公開ページが自動取得します。
- JSON・CSV・Excel・編集画面・データベース・ローカルサーバー・BATでの変換は不要です。
- 公開先は GitHub Pages を想定しています（HTTPS配信）。
- 円をクリック：**その円の左または右に**詳細カードを表示（モーダルなし）。
- 円をダブルクリック：その円を中心に切り替え、1段目・2段目の関連項目を表示。
- 周囲の円はおよそ **5分で1周**の速度でゆっくり公転。詳細表示中・ホバー中は一時停止。
- マップはドラッグで移動、ホイールで拡大縮小できます。
- ナビゲーション、ヘッダー、フッター、検索欄、編集用UIはありません。

## 1. ファイル構成

```text
shrine-knowledge-map/
├── index.html              ブラウザ表示（通常編集しない）
├── .nojekyll                Jekyllの自動処理を無効化（空ファイル）
├── js/
│   └── app.js              マップ表示・YAML読込処理（通常編集しない）
├── data/
│   ├── manifest.yaml       読み込むYAMLの一覧
│   ├── core.yaml           神社・神々・神宝・中心テーマ
│   ├── architecture.yaml   建築様式・建築用語・代表的な神社
│   ├── rank.yaml           式内社・古代／近代社格・社号
│   ├── relations.yaml      ノード間の接続元・接続先・関係名
│   └── sources.yaml        参考資料のリンク
└── README.md
```

初期データは **68項目、106関係、78参考資料リンク** を登録しています。参考資料リンクは同じURLを共有する場合もあります。

### 今回追加したテーマ

- **建築様式**：神明造、唯一神明造、大社造、流造、春日造、住吉造、八幡造、権現造、浅間造、日吉造、平入、妻入、切妻造、本殿、拝殿、幣殿。代表神社へのリンク付き。
- **式内社・社格**：延喜式神名帳、式内社、式外社、名神大社、延喜式の大社・小社、古代の官幣社・国幣社、一宮、近代社格制度、近代の官幣社・国幣社、府県社・郷社・村社、別表神社、社号、国史見在社。

> 注意：「式内社」「古代の官幣社・国幣社」「近代社格制度」は**異なる時代・制度**の分類です。また「神宮」「大社」は社号であり、旧社格と自動的に同義にはなりません。戦後、国家による社格制度は廃止されました。

## 2. GitHub Pagesに公開する

1. GitHubでリポジトリを作成します。例：`shrine-knowledge-map`。
2. **このフォルダーの中身**（`index.html`、`js/`、`data/`、`.nojekyll`）をリポジトリのルートにアップロードし、コミットします。ZIPをそのままアップロードするのではなく、展開して配置してください。
3. リポジトリの **Settings → Pages** を開きます。
4. **Build and deployment → Source: Deploy from a branch** を選び、`main` ブランチと `/ (root)` を選択して保存します。
5. 公開されたURL（例：`https://ユーザー名.github.io/shrine-knowledge-map/`）を開いてください。

通常のGitHub Pagesでは、公開サイトが `data/manifest.yaml` と各YAMLを **`fetch()` で直接読み込みます**。変換作業は不要です。追加・修正してコミットしたら、Pages側へのデプロイ完了後にページを再読み込みしてください。

### ローカル起動について

**`index.html` をダブルクリックする `file://` 起動には対応していません。** ブラウザのセキュリティ制約により、`file://` からYAMLを `fetch()` できないためです。今回の構成はGitHub Pagesで公開する用途に合わせています。ローカルサーバーは**公開運用には不要**です。

YAML解析にはCDN上の **js-yaml 4.1.0** を利用します。公開ページを開く際はネット接続が必要です。公開データはGitHub上のファイルそのものなので、ブラウザの一時保存に依存しません。

## 3. データの新規追加

例として、知識項目に「千木」を追加する方法を示します。

### ① `data/architecture.yaml` に追記

```yaml
- id: chigi
  type: architecture
  name: 千木
  reading: ちぎ
  short: 屋根の両端で交差する部材
  description: |
    神社の屋根の棟の両端で交差して上に伸びる部材。
    社殿の構造や意匠を知る手がかりとなります。
  tags:
    - 屋根
    - 社殿
```

`id` は全ファイルを通じて重複しない英数字・アンダースコア等を使用してください。`description: |` 以降の行はインデントを揃えると複数行の本文を記載できます。

**選べる type**：`shrine`（神社）、`kami`（神様）、`treasure`（神宝）、`concept`（信仰・概念）、`architecture`（建築）、`rank`（社格・制度）。

### ② `data/relations.yaml` に追記

```yaml
- from: shimmei
  to: chigi
  label: 屋根の意匠
```

ここでの `from` / `to` は `id` と一致させてください。関係は**双方向**にたどれます。接続した項目は中心が切り替わった際にも自動的に表示されます。

### ③ `data/sources.yaml` に追記（任意）

```yaml
- node_id: chigi
  title: 伊勢神宮｜社殿の建築
  url: https://www.isejingu.or.jp/about/architecture/
```

保存してGitHubにコミットするだけでOKです。HTMLやJavaScriptは編集不要です。

## 4. 既存データの更新と削除

- **更新**：該当する項目の `name`、`description`、`short`、`tags` などを書き換えてコミット。関係の変更は `relations.yaml` を編集します。
- **削除**：対象項目の `- id: ...` から次の `- id:` の直前までのブロックを削除します。続いて、そのIDが含まれる `relations.yaml` の `from` / `to` と `sources.yaml` の `node_id` も削除してください。
- **追加分を別ファイルに分割**：`data/` に `regional-shrines.yaml` 等を作成し、`data/manifest.yaml` の `nodes:` に `- regional-shrines.yaml` を追加します。HTMLは変更しません。

例えば `manifest.yaml`：

```yaml
nodes:
  - core.yaml
  - architecture.yaml
  - rank.yaml
  - regional-shrines.yaml
relations:
  - relations.yaml
sources:
  - sources.yaml
```

ファイルを分けたときも、各項目の `id` は全ファイルを横断して一意である必要があります。`manifest.yaml` に列挙されていないYAMLは自動読み込みされません。

## 5. エラーと確認

読み込み時に**重複ID、不明な参照先、重複した関係線、ファイル欠落、不正なYAML**を検査します。問題があれば画面にエラーを表示し、どのファイルのどの項目を確認すべきかを説明します。

GitHub Pagesで変更が見えないときは、コミットが完了し、**ActionsまたはPagesで公開処理が完了したか**を確認してください。その後、ブラウザを再読み込みします。

## 6. 参考にした資料

サイト内の `sources.yaml` から各ノードの出典を参照できます。主な資料：

- 神社本庁「社殿について」 https://www.jinjahoncho.or.jp/omairi/shaden/
- 伊勢神宮「社殿の建築」 https://www.isejingu.or.jp/about/architecture/
- 東京都神社庁「神社の建築様式」 https://mamechishiki.tokyo/?p=742
- 國學院大學「式内社データベース」 https://d-museum.kokugakuin.ac.jp/topics_detail12/
- 岡山県神社庁「神道用語辞典」 https://www.okayama-jinjacho.or.jp/shinto/term/
- 神社本庁「神宮・神社の名称」 https://www.jinjahoncho.or.jp/omairi/name/

各神社・歴史制度の説明は簡潔にまとめたものです。神社建築には例外や改修、文献による解釈の違いがあります。特定の神社の現在の社殿や社格比定については、個別に一次資料で確認してください。
