/**
 * Config.gs — global constants and schema for TWW Content Writer Hub.
 * Apps Script shares one global scope across all .gs files in a project:
 * no import/export/require here, plain top-level var/const only.
 */

var APP_NAME = 'TWW Content Writer Hub';
var APP_VERSION = '0.2.0';
var DB_NAME = 'TWW Content Writer Hub DB';
var DOCS_FOLDER_NAME = 'TWW Content Writer Hub - Posts';

var PROP_SHEET_ID = 'SHEET_ID';
var PROP_DOCS_FOLDER_ID = 'DOCS_FOLDER_ID';

var SESSION_DAYS = 90;
var HASH_ITERATIONS = 200;
var MAX_BODY_BYTES = 200000;
var LOGIN_MAX_FAILS = 5;
var LOGIN_LOCK_SECONDS = 900;
var HOUSE_SCOPE = 'HOUSE';
var POST_STATUSES = ['draft', 'ready', 'posted'];
var FORMAT_STATUSES = ['draft', 'published'];

var SCHEMA = {
  Users: [
    'user_id', 'username', 'display_name', 'role', 'pass_hash', 'pass_salt',
    'playfulness_default', 'catchphrases', 'avoid_list', 'active', 'created_at'
  ],
  Sessions: [
    'token_hash', 'user_id', 'created_at', 'expires_at', 'last_seen_at'
  ],
  Posts: [
    'post_id', 'user_id', 'format_id', 'project_name', 'location', 'post_status',
    'case_summary', 'inputs_json', 'results_json', 'narrative_json', 'tone_json',
    'body', 'doc_url', 'is_style_example', 'created_at', 'updated_at'
  ],
  Examples: [
    'example_id', 'owner', 'format_id', 'title', 'body', 'source', 'source_ref',
    'created_by', 'created_at', 'active'
  ],
  StyleDNA: [
    'dna_id', 'scope', 'version', 'dna_json', 'changelog', 'source_example_ids',
    'created_by', 'created_at', 'is_current'
  ],
  Formats: [
    'format_id', 'name', 'version', 'status', 'spec_json', 'created_by',
    'created_at', 'updated_at'
  ],
  Comps: [
    'comp_id', 'project_name', 'location', 'price_per_sqm', 'source', 'note',
    'created_by', 'created_at'
  ]
};
