/**
 * Pure SQL formatting & migration dump builder utilities.
 * Decoupled from Node/Database drivers so it can be unit-tested cleanly via node:test.
 */

export interface MigrationDataset {
  applications: Record<string, any>[];
  news: Record<string, any>[];
  latestBanners: Record<string, any>[];
  govOrders: Record<string, any>[];
  contacts: Record<string, any>[];
  subAdmins: Record<string, any>[];
  adminAuth?: Record<string, any> | null;
  memberCounter?: Record<string, any> | null;
  siteStats?: Record<string, any> | null;
  leaders: Record<string, any>[];
  officials: Record<string, any>[];
  appointedPosts: Record<string, any>[];
  districtPasswords: Record<string, string>;
  presidentPassword?: string | null;
  leadershipVersion?: string | number | null;
}

export interface MigrationCounts {
  applications: number;
  news: number;
  latestBanners: number;
  govOrders: number;
  contacts: number;
  subAdmins: number;
  leaders: number;
  officials: number;
  appointedPosts: number;
  districtPasswords: number;
  settingsDocs: number;
}

export function escapeSqlValue(val: unknown): string {
  if (val === null || val === undefined) {
    return 'NULL';
  }
  if (typeof val === 'boolean') {
    return val ? '1' : '0';
  }
  if (typeof val === 'number') {
    return Number.isFinite(val) ? String(val) : '0';
  }
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  const escaped = str
    .replace(/\\/g, '\\\\')
    .replace(/\u0000/g, '\\0')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\u001a/g, '\\Z');
  return `'${escaped}'`;
}

export function buildUpsertSql(
  tableName: string,
  columns: string[],
  values: unknown[],
  primaryKeys: string[] = ['id']
): string {
  const colsSql = columns.map((c) => `\`${c}\``).join(', ');
  const valsSql = values.map((v) => escapeSqlValue(v)).join(', ');
  const updateCols = columns.filter((c) => !primaryKeys.includes(c));
  const updateSql = updateCols
    .map((c) => `\`${c}\` = VALUES(\`${c}\`)`)
    .join(', ');

  if (!updateSql) {
    return `INSERT IGNORE INTO \`${tableName}\` (${colsSql}) VALUES (${valsSql});`;
  }
  return `INSERT INTO \`${tableName}\` (${colsSql}) VALUES (${valsSql}) ON DUPLICATE KEY UPDATE ${updateSql};`;
}

export function getMigrationCounts(data: MigrationDataset): MigrationCounts {
  return {
    applications: data.applications.length,
    news: data.news.length,
    latestBanners: data.latestBanners.length,
    govOrders: data.govOrders.length,
    contacts: data.contacts.length,
    subAdmins: data.subAdmins.length,
    leaders: data.leaders.length,
    officials: data.officials.length,
    appointedPosts: data.appointedPosts.length,
    districtPasswords: Object.keys(data.districtPasswords || {}).length,
    settingsDocs:
      (data.adminAuth ? 1 : 0) +
      (data.memberCounter ? 1 : 0) +
      (data.siteStats ? 1 : 0),
  };
}

export function generateFullSqlDump(
  schemaSql: string,
  data: MigrationDataset,
  exportedAtIso: string = new Date().toISOString()
): string {
  const counts = getMigrationCounts(data);
  const lines: string[] = [
    '-- ============================================================================',
    '-- Mahasangh Full Data Migration SQL (Firestore + RTDB -> HostKarle MySQL)',
    `-- Exported At: ${exportedAtIso}`,
    `-- Record Counts: applications=${counts.applications}, news=${counts.news}, latest_banners=${counts.latestBanners}, gov_orders=${counts.govOrders}, contacts=${counts.contacts}, sub_admins=${counts.subAdmins}, leaders=${counts.leaders}, officials=${counts.officials}, appointed_posts=${counts.appointedPosts}, district_passwords=${counts.districtPasswords}`,
    '-- ============================================================================',
    '',
    schemaSql.trim(),
    '',
    '-- ============================================================================',
    '-- Migrated Data Rows',
    '-- ============================================================================',
    '',
  ];

  for (const app of data.applications) {
    const id = String(app.id || app.applicationNumber || `app_${Date.now()}`);
    lines.push(
      buildUpsertSql(
        'applications',
        [
          'id',
          'application_number',
          'member_number',
          'salutation',
          'full_name',
          'phone',
          'email',
          'address',
          'district',
          'taluka',
          'center_name',
          'family_members',
          'hobby',
          'education',
          'professional_qualification',
          'professional',
          'status',
          'reject_reason',
          'photo',
          'payment_ref',
          'payment_confirmed',
          'razorpay_payment_id',
          'razorpay_order_id',
          'is_official',
          'official_post',
          'official_district',
          'official_taluka',
          'approved_by',
          'id_card_email_sent',
          'id_card_email_sent_at',
          'welcome_email_sent',
          'welcome_email_sent_at',
          'created_at',
          'approved_at',
          'rejected_at',
          'updated_at',
          'extra_json',
        ],
        [
          id,
          String(app.applicationNumber || ''),
          String(app.memberNumber || ''),
          String(app.salutation || ''),
          String(app.fullName || ''),
          String(app.phone || ''),
          String(app.email || ''),
          String(app.address || ''),
          String(app.district || ''),
          String(app.taluka || ''),
          String(app.centerName || ''),
          String(app.familyMembers || ''),
          String(app.hobby || ''),
          String(app.education || ''),
          String(app.professionalQualification || ''),
          String(app.professional || ''),
          app.status === 'approved' || app.status === 'rejected' ? app.status : 'pending',
          String(app.rejectReason || ''),
          String(app.photo || ''),
          String(app.paymentRef || ''),
          Boolean(app.paymentConfirmed),
          String(app.razorpayPaymentId || ''),
          String(app.razorpayOrderId || ''),
          Boolean(app.isOfficial),
          String(app.officialPost || ''),
          String(app.officialDistrict || ''),
          String(app.officialTaluka || ''),
          String(app.approvedBy || ''),
          Boolean(app.idCardEmailSent),
          String(app.idCardEmailSentAt || ''),
          Boolean(app.welcomeEmailSent),
          String(app.welcomeEmailSentAt || ''),
          String(app.createdAt || ''),
          String(app.approvedAt || ''),
          String(app.rejectedAt || ''),
          String(app.updatedAt || ''),
          JSON.stringify(app),
        ]
      )
    );
  }

  for (const item of data.news) {
    lines.push(
      buildUpsertSql(
        'news',
        ['id', 'title', 'publish_date', 'category', 'image_url', 'summary', 'content', 'featured', 'created_at'],
        [
          String(item.id),
          String(item.title || ''),
          String(item.date || item.publishDate || ''),
          String(item.category || ''),
          String(item.image || item.imageUrl || ''),
          String(item.summary || ''),
          String(item.content || ''),
          Boolean(item.featured),
          String(item.createdAt || ''),
        ]
      )
    );
  }

  for (const banner of data.latestBanners) {
    lines.push(
      buildUpsertSql(
        'latest_banners',
        ['id', 'title', 'summary', 'image_url', 'banner_date', 'created_at'],
        [
          String(banner.id),
          String(banner.title || ''),
          String(banner.summary || ''),
          String(banner.imageUrl || ''),
          String(banner.date || ''),
          String(banner.createdAt || ''),
        ]
      )
    );
  }

  for (const order of data.govOrders) {
    lines.push(
      buildUpsertSql(
        'gov_orders',
        ['id', 'title', 'order_date', 'order_type', 'file_url', 'drive_url', 'summary', 'created_at'],
        [
          String(order.id),
          String(order.title || ''),
          String(order.date || ''),
          String(order.type || 'शासन निर्णय'),
          String(order.fileUrl || ''),
          String(order.driveUrl || ''),
          String(order.summary || ''),
          String(order.createdAt || ''),
        ]
      )
    );
  }

  for (const contact of data.contacts) {
    lines.push(
      buildUpsertSql(
        'contacts',
        ['id', 'name', 'phone', 'email', 'district', 'subject', 'message', 'created_at'],
        [
          String(contact.id),
          String(contact.name || ''),
          String(contact.phone || ''),
          String(contact.email || ''),
          String(contact.district || ''),
          String(contact.subject || ''),
          String(contact.message || ''),
          String(contact.createdAt || ''),
        ]
      )
    );
  }

  for (const admin of data.subAdmins) {
    lines.push(
      buildUpsertSql(
        'sub_admins',
        ['id', 'email', 'name', 'password', 'is_first_login', 'is_super_admin', 'permissions_json', 'created_at', 'last_login_at'],
        [
          String(admin.id),
          String(admin.email || '').toLowerCase(),
          String(admin.name || ''),
          String(admin.password || ''),
          Boolean(admin.isFirstLogin),
          Boolean(admin.isSuperAdmin),
          JSON.stringify(admin.permissions || {}),
          String(admin.createdAt || ''),
          String(admin.lastLoginAt || ''),
        ]
      )
    );
  }

  if (data.adminAuth) {
    lines.push(
      buildUpsertSql(
        'system_settings',
        ['setting_key', 'setting_json', 'updated_at'],
        ['admin_auth', JSON.stringify(data.adminAuth), String(data.adminAuth.updatedAt || exportedAtIso)],
        ['setting_key']
      )
    );
  }

  if (data.memberCounter) {
    lines.push(
      buildUpsertSql(
        'system_settings',
        ['setting_key', 'setting_json', 'updated_at'],
        ['member_counter', JSON.stringify(data.memberCounter), String(data.memberCounter.lastUpdated || exportedAtIso)],
        ['setting_key']
      )
    );
  }

  if (data.siteStats) {
    lines.push(
      buildUpsertSql(
        'site_stats',
        ['stat_key', 'total_count', 'today_count', 'last_date', 'last_updated'],
        [
          'visits',
          Number(data.siteStats.total || 5155),
          Number(data.siteStats.today || 0),
          String(data.siteStats.lastDate || ''),
          String(data.siteStats.lastUpdated || exportedAtIso),
        ],
        ['stat_key']
      )
    );
  }

  data.leaders.forEach((leader, idx) => {
    const id = String(leader.id || `leader_${idx}`);
    lines.push(
      buildUpsertSql(
        'leaders',
        ['id', 'order_index', 'name', 'role', 'region', 'education', 'phone', 'email', 'photo', 'is_key', 'category', 'updated_at'],
        [
          id,
          typeof leader.orderIndex === 'number' ? leader.orderIndex : idx,
          String(leader.name || ''),
          String(leader.role || ''),
          String(leader.region || ''),
          String(leader.education || ''),
          String(leader.phone || ''),
          String(leader.email || ''),
          String(leader.photo || ''),
          Boolean(leader.isKey),
          String(leader.category || ''),
          String(leader.updatedAt || exportedAtIso),
        ]
      )
    );
  });

  for (const off of data.officials) {
    lines.push(
      buildUpsertSql(
        'officials',
        [
          'id',
          'salutation',
          'first_name',
          'middle_name',
          'last_name',
          'appointed_post',
          'district',
          'taluka',
          'current_cadre',
          'working_place',
          'mobile',
          'photo',
          'appointed_date',
          'order_number',
          'updated_at',
        ],
        [
          String(off.id),
          String(off.salutation || 'श्री.'),
          String(off.firstName || ''),
          String(off.middleName || ''),
          String(off.lastName || ''),
          String(off.appointedPost || ''),
          String(off.district || ''),
          String(off.taluka || ''),
          String(off.currentCadre || ''),
          String(off.workingPlace || ''),
          String(off.mobile || ''),
          String(off.photo || ''),
          String(off.appointedDate || ''),
          String(off.orderNumber || ''),
          String(off.updatedAt || exportedAtIso),
        ]
      )
    );
  }

  data.appointedPosts.forEach((post, idx) => {
    const id = String(post.id || `post_${idx}`);
    lines.push(
      buildUpsertSql(
        'appointed_posts',
        ['id', 'sort_order', 'title', 'level', 'extra_json'],
        [
          id,
          idx,
          String(post.title || post.name || ''),
          String(post.level || post.category || 'district'),
          JSON.stringify(post),
        ]
      )
    );
  });

  for (const [district, pwd] of Object.entries(data.districtPasswords || {})) {
    lines.push(
      buildUpsertSql(
        'district_passwords',
        ['district', 'password', 'updated_at'],
        [district, String(pwd || ''), exportedAtIso],
        ['district']
      )
    );
  }

  if (data.presidentPassword) {
    lines.push(
      buildUpsertSql(
        'leadership_meta',
        ['meta_key', 'meta_value', 'updated_at'],
        ['president_password', String(data.presidentPassword), exportedAtIso],
        ['meta_key']
      )
    );
  }

  if (data.leadershipVersion !== undefined && data.leadershipVersion !== null) {
    lines.push(
      buildUpsertSql(
        'leadership_meta',
        ['meta_key', 'meta_value', 'updated_at'],
        ['leadership_version', String(data.leadershipVersion), exportedAtIso],
        ['meta_key']
      )
    );
  }

  lines.push('');
  return lines.join('\n');
}
