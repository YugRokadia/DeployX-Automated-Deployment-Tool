-- Extend healing_event_type enum with canary and rolling deployment events
-- These track promotion stages and rollback actions for the new deployment strategies

ALTER TYPE healing_event_type ADD VALUE 'canary_promotion';
ALTER TYPE healing_event_type ADD VALUE 'canary_rollback';
ALTER TYPE healing_event_type ADD VALUE 'rolling_instance_updated';
ALTER TYPE healing_event_type ADD VALUE 'rolling_rollback';
