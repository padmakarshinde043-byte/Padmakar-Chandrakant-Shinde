export interface MysqlColumnSpec {
  name: string;
  definition: string;
}

export interface MysqlIndexSpec {
  name: string;
  definition: string; // e.g. "INDEX `idx_apps_phone` (`phone`)" or "UNIQUE KEY `uniq_sub_admin_email` (`email`(191))"
}

export interface MysqlTableSpec {
  table: string;
  marathiLabel: string;
  primaryKey: string;
  columns: MysqlColumnSpec[];
  indexes?: MysqlIndexSpec[];
}

export interface MysqlTableAuditSummary {
  table: string;
  marathiLabel: string;
  status: 'ok' | 'created_table' | 'repaired_columns' | 'error';
  expectedColumns: number;
  existingColumnsBefore: number;
  existingColumnsAfter: number;
  addedColumns: string[];
  addedIndexes: string[];
  missingColumnsRemaining: string[];
  errorMessage?: string;
}

export interface MysqlSchemaAuditReport {
  status: 'healthy' | 'repaired' | 'partial_error' | 'mock_preview';
  activeBackend: 'mysql' | 'mock';
  checkedAt: string;
  tablesChecked: number;
  totalExpectedColumns: number;
  createdTables: string[];
  addedColumns: Array<{ table: string; column: string }>;
  addedIndexes: Array<{ table: string; index: string }>;
  errors: string[];
  tables: MysqlTableAuditSummary[];
}

export const MYSQL_SCHEMA_MANIFEST: MysqlTableSpec[] = [
  {
    table: 'applications',
    marathiLabel: 'सदस्यत्व अर्ज व सभासद (applications)',
    primaryKey: 'id',
    columns: [
      { name: 'id', definition: 'VARCHAR(128) NOT NULL' },
      { name: 'application_number', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
      { name: 'member_number', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
      { name: 'salutation', definition: "VARCHAR(32) NOT NULL DEFAULT ''" },
      { name: 'gender', definition: "VARCHAR(24) NOT NULL DEFAULT ''" },
      { name: 'full_name', definition: "VARCHAR(255) NOT NULL DEFAULT ''" },
      { name: 'phone', definition: "VARCHAR(32) NOT NULL DEFAULT ''" },
      { name: 'email', definition: "VARCHAR(255) NOT NULL DEFAULT ''" },
      { name: 'address', definition: 'TEXT NULL' },
      { name: 'district', definition: "VARCHAR(128) NOT NULL DEFAULT ''" },
      { name: 'taluka', definition: "VARCHAR(128) NOT NULL DEFAULT ''" },
      { name: 'center_name', definition: "VARCHAR(255) NOT NULL DEFAULT ''" },
      { name: 'family_members', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
      { name: 'hobby', definition: "VARCHAR(255) NOT NULL DEFAULT ''" },
      { name: 'education', definition: "VARCHAR(255) NOT NULL DEFAULT ''" },
      { name: 'professional_qualification', definition: "VARCHAR(255) NOT NULL DEFAULT ''" },
      { name: 'professional', definition: "VARCHAR(255) NOT NULL DEFAULT ''" },
      { name: 'status', definition: "ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending'" },
      { name: 'reject_reason', definition: 'TEXT NULL' },
      { name: 'photo', definition: 'LONGTEXT NULL' },
      { name: 'payment_ref', definition: "VARCHAR(128) NOT NULL DEFAULT ''" },
      { name: 'payment_confirmed', definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
      { name: 'razorpay_payment_id', definition: "VARCHAR(128) NOT NULL DEFAULT ''" },
      { name: 'razorpay_order_id', definition: "VARCHAR(128) NOT NULL DEFAULT ''" },
      { name: 'is_official', definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
      { name: 'official_post', definition: "VARCHAR(255) NOT NULL DEFAULT ''" },
      { name: 'official_district', definition: "VARCHAR(128) NOT NULL DEFAULT ''" },
      { name: 'official_taluka', definition: "VARCHAR(128) NOT NULL DEFAULT ''" },
      { name: 'approved_by', definition: "VARCHAR(128) NOT NULL DEFAULT ''" },
      { name: 'id_card_email_sent', definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
      { name: 'id_card_email_sent_at', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
      { name: 'welcome_email_sent', definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
      { name: 'welcome_email_sent_at', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
      { name: 'created_at', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
      { name: 'approved_at', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
      { name: 'rejected_at', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
      { name: 'updated_at', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
      { name: 'extra_json', definition: 'LONGTEXT NULL' },
    ],
    indexes: [
      { name: 'idx_apps_phone', definition: 'INDEX `idx_apps_phone` (`phone`)' },
      { name: 'idx_apps_status', definition: 'INDEX `idx_apps_status` (`status`)' },
      { name: 'idx_apps_member_number', definition: 'INDEX `idx_apps_member_number` (`member_number`)' },
      { name: 'idx_apps_application_number', definition: 'INDEX `idx_apps_application_number` (`application_number`)' },
      { name: 'idx_apps_email', definition: 'INDEX `idx_apps_email` (`email`(191))' },
      { name: 'idx_apps_razorpay_order', definition: 'INDEX `idx_apps_razorpay_order` (`razorpay_order_id`)' },
      { name: 'idx_apps_district', definition: 'INDEX `idx_apps_district` (`district`)' },
    ],
  },
  {
    table: 'news',
    marathiLabel: 'बातम्या व परिपत्रके (news)',
    primaryKey: 'id',
    columns: [
      { name: 'id', definition: 'VARCHAR(128) NOT NULL' },
      { name: 'title', definition: "VARCHAR(500) NOT NULL DEFAULT ''" },
      { name: 'publish_date', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
      { name: 'category', definition: "VARCHAR(128) NOT NULL DEFAULT ''" },
      { name: 'image_url', definition: 'TEXT NULL' },
      { name: 'summary', definition: 'TEXT NULL' },
      { name: 'content', definition: 'LONGTEXT NULL' },
      { name: 'featured', definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
      { name: 'created_at', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
    ],
    indexes: [{ name: 'idx_news_category', definition: 'INDEX `idx_news_category` (`category`)' }],
  },
  {
    table: 'latest_banners',
    marathiLabel: 'ताज्या घडामोडी बॅनर्स (latest_banners)',
    primaryKey: 'id',
    columns: [
      { name: 'id', definition: 'VARCHAR(128) NOT NULL' },
      { name: 'title', definition: "VARCHAR(500) NOT NULL DEFAULT ''" },
      { name: 'summary', definition: 'TEXT NULL' },
      { name: 'image_url', definition: 'TEXT NULL' },
      { name: 'video_url', definition: 'TEXT NULL' },
      { name: 'media_type', definition: "VARCHAR(32) NOT NULL DEFAULT 'image'" },
      { name: 'banner_date', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
      { name: 'created_at', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
    ],
  },
  {
    table: 'gov_orders',
    marathiLabel: 'शासन निर्णय / GR (gov_orders)',
    primaryKey: 'id',
    columns: [
      { name: 'id', definition: 'VARCHAR(128) NOT NULL' },
      { name: 'title', definition: "VARCHAR(500) NOT NULL DEFAULT ''" },
      { name: 'order_date', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
      { name: 'order_type', definition: "VARCHAR(128) NOT NULL DEFAULT 'शासन निर्णय'" },
      { name: 'file_url', definition: 'TEXT NULL' },
      { name: 'drive_url', definition: 'TEXT NULL' },
      { name: 'summary', definition: 'TEXT NULL' },
      { name: 'created_at', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
    ],
  },
  {
    table: 'contacts',
    marathiLabel: 'संपर्क व प्राप्त संदेश (contacts)',
    primaryKey: 'id',
    columns: [
      { name: 'id', definition: 'VARCHAR(128) NOT NULL' },
      { name: 'name', definition: "VARCHAR(255) NOT NULL DEFAULT ''" },
      { name: 'phone', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
      { name: 'email', definition: "VARCHAR(255) NOT NULL DEFAULT ''" },
      { name: 'district', definition: "VARCHAR(128) NOT NULL DEFAULT ''" },
      { name: 'subject', definition: "VARCHAR(500) NOT NULL DEFAULT ''" },
      { name: 'message', definition: 'LONGTEXT NULL' },
      { name: 'photo', definition: 'LONGTEXT NULL' },
      { name: 'created_at', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
    ],
  },
  {
    table: 'sub_admins',
    marathiLabel: 'व्यवस्थापक / Sub-Admins (sub_admins)',
    primaryKey: 'id',
    columns: [
      { name: 'id', definition: 'VARCHAR(128) NOT NULL' },
      { name: 'email', definition: "VARCHAR(255) NOT NULL DEFAULT ''" },
      { name: 'name', definition: "VARCHAR(255) NOT NULL DEFAULT ''" },
      { name: 'password', definition: "VARCHAR(255) NOT NULL DEFAULT ''" },
      { name: 'is_first_login', definition: 'TINYINT(1) NOT NULL DEFAULT 1' },
      { name: 'is_super_admin', definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
      { name: 'permissions_json', definition: 'TEXT NULL' },
      { name: 'created_at', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
      { name: 'last_login_at', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
    ],
    indexes: [
      {
        name: 'uniq_sub_admin_email',
        definition: 'UNIQUE KEY `uniq_sub_admin_email` (`email`(191))',
      },
    ],
  },
  {
    table: 'system_settings',
    marathiLabel: 'प्रणाली सेटिंग्ज व काउंटर (system_settings)',
    primaryKey: 'setting_key',
    columns: [
      { name: 'setting_key', definition: 'VARCHAR(128) NOT NULL' },
      { name: 'setting_json', definition: 'LONGTEXT NULL' },
      { name: 'updated_at', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
    ],
  },
  {
    table: 'site_stats',
    marathiLabel: 'संकेतस्थळ भेटी मोजणी (site_stats)',
    primaryKey: 'stat_key',
    columns: [
      { name: 'stat_key', definition: 'VARCHAR(64) NOT NULL' },
      { name: 'total_count', definition: 'INT NOT NULL DEFAULT 5155' },
      { name: 'today_count', definition: 'INT NOT NULL DEFAULT 0' },
      { name: 'last_date', definition: "VARCHAR(32) NOT NULL DEFAULT ''" },
      { name: 'last_updated', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
    ],
  },
  {
    table: 'leaders',
    marathiLabel: 'राज्य पदाधिकारी यादी (leaders)',
    primaryKey: 'id',
    columns: [
      { name: 'id', definition: 'VARCHAR(128) NOT NULL' },
      { name: 'order_index', definition: 'INT NOT NULL DEFAULT 0' },
      { name: 'name', definition: "VARCHAR(255) NOT NULL DEFAULT ''" },
      { name: 'role', definition: "VARCHAR(255) NOT NULL DEFAULT ''" },
      { name: 'region', definition: "VARCHAR(255) NOT NULL DEFAULT ''" },
      { name: 'education', definition: "VARCHAR(255) NOT NULL DEFAULT ''" },
      { name: 'phone', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
      { name: 'email', definition: "VARCHAR(255) NOT NULL DEFAULT ''" },
      { name: 'photo', definition: 'LONGTEXT NULL' },
      { name: 'is_key', definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
      { name: 'category', definition: "VARCHAR(128) NOT NULL DEFAULT ''" },
      { name: 'updated_at', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
    ],
    indexes: [{ name: 'idx_leaders_order', definition: 'INDEX `idx_leaders_order` (`order_index`)' }],
  },
  {
    table: 'officials',
    marathiLabel: 'जिल्हा व तालुका नियुक्त अधिकारी (officials)',
    primaryKey: 'id',
    columns: [
      { name: 'id', definition: 'VARCHAR(128) NOT NULL' },
      { name: 'salutation', definition: "VARCHAR(32) NOT NULL DEFAULT 'श्री.'" },
      { name: 'first_name', definition: "VARCHAR(128) NOT NULL DEFAULT ''" },
      { name: 'middle_name', definition: "VARCHAR(128) NOT NULL DEFAULT ''" },
      { name: 'last_name', definition: "VARCHAR(128) NOT NULL DEFAULT ''" },
      { name: 'appointed_post', definition: "VARCHAR(255) NOT NULL DEFAULT ''" },
      { name: 'district', definition: "VARCHAR(128) NOT NULL DEFAULT ''" },
      { name: 'taluka', definition: "VARCHAR(128) NOT NULL DEFAULT ''" },
      { name: 'current_cadre', definition: "VARCHAR(128) NOT NULL DEFAULT ''" },
      { name: 'working_place', definition: "VARCHAR(255) NOT NULL DEFAULT ''" },
      { name: 'mobile', definition: "VARCHAR(32) NOT NULL DEFAULT ''" },
      { name: 'photo', definition: 'LONGTEXT NULL' },
      { name: 'appointed_date', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
      { name: 'order_number', definition: "VARCHAR(128) NOT NULL DEFAULT ''" },
      { name: 'updated_at', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
    ],
    indexes: [{ name: 'idx_officials_district', definition: 'INDEX `idx_officials_district` (`district`)' }],
  },
  {
    table: 'appointed_posts',
    marathiLabel: 'बहाल पदे व्यवस्थापन (appointed_posts)',
    primaryKey: 'id',
    columns: [
      { name: 'id', definition: 'VARCHAR(128) NOT NULL' },
      { name: 'sort_order', definition: 'INT NOT NULL DEFAULT 0' },
      { name: 'title', definition: "VARCHAR(255) NOT NULL DEFAULT ''" },
      { name: 'level', definition: "VARCHAR(64) NOT NULL DEFAULT 'district'" },
      { name: 'extra_json', definition: 'TEXT NULL' },
      { name: 'updated_at', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
    ],
    indexes: [{ name: 'idx_posts_order', definition: 'INDEX `idx_posts_order` (`sort_order`)' }],
  },
  {
    table: 'district_passwords',
    marathiLabel: 'जिल्हाध्यक्ष लॉगिन पासवर्ड (district_passwords)',
    primaryKey: 'district',
    columns: [
      { name: 'district', definition: 'VARCHAR(128) NOT NULL' },
      { name: 'password', definition: "VARCHAR(255) NOT NULL DEFAULT ''" },
      { name: 'updated_at', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
    ],
  },
  {
    table: 'leadership_meta',
    marathiLabel: 'नेतृत्व व प्रदेशाध्यक्ष सेटिंग्ज (leadership_meta)',
    primaryKey: 'meta_key',
    columns: [
      { name: 'meta_key', definition: 'VARCHAR(128) NOT NULL' },
      { name: 'meta_value', definition: 'TEXT NULL' },
      { name: 'updated_at', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
    ],
  },
  {
    table: 'website_feedback',
    marathiLabel: 'वेबसाइट रेटिंग व अभिप्राय (website_feedback)',
    primaryKey: 'id',
    columns: [
      { name: 'id', definition: 'VARCHAR(128) NOT NULL' },
      { name: 'design_rating', definition: 'TINYINT NOT NULL DEFAULT 0' },
      { name: 'navigation_rating', definition: 'TINYINT NOT NULL DEFAULT 0' },
      { name: 'speed_rating', definition: 'TINYINT NOT NULL DEFAULT 0' },
      { name: 'mobile_rating', definition: 'TINYINT NOT NULL DEFAULT 0' },
      { name: 'overall_rating', definition: 'TINYINT NOT NULL DEFAULT 0' },
      { name: 'average_rating', definition: 'DECIMAL(3,2) NOT NULL DEFAULT 0.00' },
      { name: 'suggestion', definition: 'TEXT NULL' },
      { name: 'page_path', definition: "VARCHAR(255) NOT NULL DEFAULT '/'" },
      { name: 'device_type', definition: "VARCHAR(32) NOT NULL DEFAULT 'unknown'" },
      { name: 'created_at', definition: "VARCHAR(64) NOT NULL DEFAULT ''" },
    ],
    indexes: [{ name: 'idx_feedback_created', definition: 'INDEX `idx_feedback_created` (`created_at`)' }],
  },
];

export function buildCreateTableSql(spec: MysqlTableSpec): string {
  const lines = [
    ...spec.columns.map((c) => `  \`${c.name}\` ${c.definition}`),
    `  PRIMARY KEY (\`${spec.primaryKey}\`)`,
    ...(spec.indexes || []).map((idx) => `  ${idx.definition}`),
  ];
  return `CREATE TABLE IF NOT EXISTS \`${spec.table}\` (\n${lines.join(',\n')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
}

export function buildAlterAddColumnSql(table: string, col: MysqlColumnSpec): string {
  return `ALTER TABLE \`${table}\` ADD COLUMN \`${col.name}\` ${col.definition}`;
}

export function buildAlterAddIndexSql(table: string, idx: MysqlIndexSpec): string {
  return `ALTER TABLE \`${table}\` ADD ${idx.definition}`;
}

export interface SchemaDiffResult {
  tablesToCreate: MysqlTableSpec[];
  columnsToAdd: Array<{ table: string; column: MysqlColumnSpec }>;
  indexesToAdd: Array<{ table: string; index: MysqlIndexSpec }>;
}

export function computeSchemaDiff(params: {
  existingTables: Set<string>;
  existingColumnsByTable: Map<string, Set<string>>;
  existingIndexesByTable: Map<string, Set<string>>;
  manifest?: MysqlTableSpec[];
}): SchemaDiffResult {
  const manifest = params.manifest || MYSQL_SCHEMA_MANIFEST;
  const tablesToCreate: MysqlTableSpec[] = [];
  const columnsToAdd: Array<{ table: string; column: MysqlColumnSpec }> = [];
  const indexesToAdd: Array<{ table: string; index: MysqlIndexSpec }> = [];

  for (const spec of manifest) {
    const tableKey = spec.table.toLowerCase();
    const tableExists = params.existingTables.has(tableKey);

    if (!tableExists) {
      tablesToCreate.push(spec);
      continue;
    }

    const existingCols = params.existingColumnsByTable.get(tableKey) || new Set<string>();
    for (const col of spec.columns) {
      if (!existingCols.has(col.name.toLowerCase())) {
        columnsToAdd.push({ table: spec.table, column: col });
      }
    }

    const existingIdxs = params.existingIndexesByTable.get(tableKey) || new Set<string>();
    for (const idx of spec.indexes || []) {
      if (!existingIdxs.has(idx.name.toLowerCase())) {
        indexesToAdd.push({ table: spec.table, index: idx });
      }
    }
  }

  return { tablesToCreate, columnsToAdd, indexesToAdd };
}

export function isRecoverableMysqlSchemaError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '').toUpperCase();
  const errno = Number(err.errno || 0);
  const msg = String(err.message || '');
  if (code === 'ER_BAD_FIELD_ERROR' || code === 'ER_NO_SUCH_TABLE' || errno === 1054 || errno === 1146) {
    return true;
  }
  return /Unknown column\s+['"`]/i.test(msg) || /Table\s+['"`].*['"`]\s+doesn't exist/i.test(msg);
}

export function getTotalManifestColumnsCount(manifest: MysqlTableSpec[] = MYSQL_SCHEMA_MANIFEST): number {
  return manifest.reduce((acc, t) => acc + t.columns.length, 0);
}
