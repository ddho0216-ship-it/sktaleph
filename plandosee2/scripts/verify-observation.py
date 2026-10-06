import argparse, datetime as dt, hashlib, json, pathlib
from zoneinfo import ZoneInfo

p = argparse.ArgumentParser()
p.add_argument('export'); p.add_argument('baseline'); p.add_argument('screenshot')
a = p.parse_args()
d = json.loads(pathlib.Path(a.export).read_text())
b = json.loads(pathlib.Path(a.baseline).read_text())
logs = d['studyLogs']; change = d['ruleChanges'][0]
assert len(logs) == 5 and len({l['date'] for l in logs}) == 5
assert [l['date'] for l in logs] == sorted(l['date'] for l in logs)
def instant(s): return dt.datetime.fromisoformat(s.replace('Z', '+00:00'))
for l in logs:
    assert instant(l['recordedAt']).astimezone(ZoneInfo('Asia/Seoul')).date().isoformat() == l['date']
    assert isinstance(l['minutes'], (int, float)) and 0 <= l['minutes'] <= 1440 and l['note']
assert len(d['ruleChanges']) == 1
assert instant(logs[1]['recordedAt']) < instant(change['changedAt']) < instant(logs[2]['recordedAt'])
assert change['baselineDates'] == [l['date'] for l in logs[:2]]
assert [l['rule'] for l in logs] == [change['oldRule']]*2 + [change['newRule']]*3
def legacy_rows(rows, fields): return sorted([json.dumps({k:r.get(k) for k in fields},ensure_ascii=False,sort_keys=True) for r in rows])
task_fields = ['title','status','estimatedMinutes','priority','tags','plannedDate','dueDate']
old_tasks = legacy_rows(b['tasks'], task_fields)
new_tasks = legacy_rows(d['tasks'], task_fields)
for row in old_tasks: assert row in new_tasks
old_by_id = {t['id']:t['title'] for t in b['tasks']}
new_by_id = {t['id']:t['title'] for t in d['tasks']}
def executions(rows, titles):
    return sorted(json.dumps({'title':titles[e['taskId']],**{k:e.get(k) for k in ['startedAt','endedAt','durationMinutes','reason']}},ensure_ascii=False,sort_keys=True) for e in rows)
for row in executions(b['executions'],old_by_id): assert row in executions(d['executions'],new_by_id)
for v in b['versions']: assert any(json.loads(x['snapshot'])==json.loads(v['snapshot']) and x['createdAt']==v['createdAt'] for x in d['versions'])
total=sum(l['minutes'] for l in logs); before=sum(l['minutes'] for l in logs[:2]); after=sum(l['minutes'] for l in logs[2:])
assert (total,total/5,before/2,after/3) == (990,198,150,230) # Screenshot independently read by reviewer.
result={'kind':'ACTUAL_USER_EXPORT_AND_SCREENSHOT','dates':[l['date'] for l in logs],'logs':logs,'ruleChange':change,'observation':d['observation'],
 'calculation':{'dailyMinutes':[l['minutes'] for l in logs],'sum':total,'average':total/5,'beforeSum':before,'beforeAverage':before/2,'afterSum':after,'afterAverage':after/3,'averageDifference':after/3-before/2},
 'checks':{'fiveDistinctSeoulDays':True,'recordDatesMatchServerTimestamps':True,'changeBetweenSecondAndThirdRecord':True,'baselineDatesMatch':True,'screenshotValuesMatch':True,'legacyTasksPreserved':len(b['tasks']),'legacyExecutionsPreserved':len(b['executions']),'legacyVersionsPreserved':len(b['versions'])},
 'integrity':{'exportSha256':hashlib.sha256(pathlib.Path(a.export).read_bytes()).hexdigest(),'screenshotSha256':hashlib.sha256(pathlib.Path(a.screenshot).read_bytes()).hexdigest()},
 'limitation':'Original question concerns shorter tasks; actual changed rule is not rushing. Neither a causal effect nor a test of shorter-task-first is claimed.'}
third_day_executions=[e for e in d['executions'] if instant(e['endedAt']).astimezone(ZoneInfo('Asia/Seoul')).date().isoformat()==logs[2]['date']]
result['timingScope']={'recordOrderSatisfied':True,'doesNotProveRuleChangedBeforeThirdDayStudy':True,'thirdDayExecutionsBeforeRuleChange':[{'taskTitle':e.get('taskTitle',''),'durationMinutes':e['durationMinutes'],'endedAt':e['endedAt']} for e in third_day_executions if instant(e['endedAt'])<instant(change['changedAt'])]}
pathlib.Path('docs/evidence/observation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
pathlib.Path('public/observation-evidence.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result['checks'],ensure_ascii=False))
