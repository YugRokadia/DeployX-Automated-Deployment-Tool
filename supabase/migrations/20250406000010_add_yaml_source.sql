-- Add yaml_source column to pipeline_definition_versions
-- Stores the original YAML text so users can view/edit it in the dashboard.
-- The parsed JSON config is already stored in config_json.
ALTER TABLE pipeline_definition_versions ADD COLUMN yaml_source text;
